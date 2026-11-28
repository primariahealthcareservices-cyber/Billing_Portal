# billingportal/backend/routes/todo.py
from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
import io
import traceback
import uuid

from models import (
    db, User,
    StaffUser, TodoTask, TodoTaskHistory, StaffNotification,
)

todo_admin_bp = Blueprint("todo_admin", __name__)

AUTHORIZED_EMAILS = {"ceo@primaria.com"}
AUTHORIZED_ROLES  = {"superadmin", "admin"}


# ───────────────────────────────────────────── helpers
def _me():
    uid = int(get_jwt_identity())
    return User.query.get(uid)


def _is_authorized(user) -> bool:
    if user is None:
        return False
    email = (getattr(user, "email", "") or "").lower()
    role  = (getattr(user, "role", "") or "").lower()
    return (
        email in {e.lower() for e in AUTHORIZED_EMAILS}
        or role in {r.lower() for r in AUTHORIZED_ROLES}
    )


def _log(task_id, action, changed_by_id, changed_by_name=None,
         old_value=None, new_value=None, note=None):
    db.session.add(TodoTaskHistory(
        task_id=task_id, action=action,
        old_value=old_value, new_value=new_value,
        changed_by_id=changed_by_id, changed_by_name=changed_by_name,
        note=note,
    ))


def _next_task_number() -> str:
    try:
        last = TodoTask.query.order_by(TodoTask.id.desc()).first()
        n = (last.id + 1) if last else 1
        return f"TASK-{datetime.utcnow().year}-{n:05d}"
    except Exception:
        return f"TASK-{datetime.utcnow().year}-{uuid.uuid4().hex[:8].upper()}"


def _add_notification(user_id, message, task_id):
    try:
        db.session.add(StaffNotification(
            user_id=user_id, message=message,
            related_type="todo_task", related_id=task_id,
        ))
    except Exception as e:
        print(f"[todo] notification add failed (non-fatal): {e}")


def _serialize(t: TodoTask) -> dict:
    today = date.today()
    assigned_name = t.assigned_to_name
    if not assigned_name and t.assigned_to_id:
        try:
            u = StaffUser.query.get(t.assigned_to_id)
            if u:
                assigned_name = u.name
        except Exception:
            pass
    return {
        "id": t.id,
        "task_number": t.task_number,
        "title": t.title,
        "description": t.description,
        "assigned_to_id": t.assigned_to_id,
        "assigned_to_name": assigned_name,
        "assigned_department": t.assigned_department,
        "assigned_by_id": t.assigned_by_id,
        "assigned_by_name": t.assigned_by_name,
        "assigned_by_email": t.assigned_by_email,
        "assigned_date": t.assigned_date.isoformat() if t.assigned_date else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "priority": t.priority,
        "status": t.status,
        "remarks": t.remarks,
        "has_attachment": bool(t.attachment_data),
        "attachment_filename": t.attachment_filename,
        "attachment_mimetype": t.attachment_mimetype,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "is_overdue": (
            t.status not in ("completed", "cancelled")
            and t.due_date is not None and t.due_date < today
        ),
    }


# ───────────────────────────────────────────── debug
@todo_admin_bp.route("/debug", methods=["GET"])
def debug_schema():
    try:
        insp_staff = db.inspect(db.get_engine(bind="staff"))
        insp_main  = db.inspect(db.engine)
        s_tables = insp_staff.get_table_names()
        out = {
            "billing_db_tables": insp_main.get_table_names(),
            "staff_db_tables": s_tables,
            "staff_users_exists":         "users" in s_tables,
            "staff_todo_tasks_exists":    "todo_tasks" in s_tables,
            "staff_todo_history_exists":  "todo_task_history" in s_tables,
            "staff_notifications_exists": "notifications" in s_tables,
        }
        if "users" in s_tables:
            out["staff_users_columns"] = [c["name"] for c in insp_staff.get_columns("users")]
            try:
                out["staff_user_count"] = StaffUser.query.count()
            except Exception as e:
                out["staff_user_count_error"] = str(e)
        if "todo_tasks" in s_tables:
            out["staff_todo_tasks_columns"] = [c["name"] for c in insp_staff.get_columns("todo_tasks")]
            try:
                out["todo_tasks_count"]   = TodoTask.query.count()
                out["todo_history_count"] = TodoTaskHistory.query.count()
            except Exception as e:
                out["count_error"] = str(e)
        if "notifications" in s_tables:
            out["staff_notifications_columns"] = [c["name"] for c in insp_staff.get_columns("notifications")]
        return jsonify(out), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ───────────────────────────────────────────── create
@todo_admin_bp.route("/", methods=["POST"])
@jwt_required()
def create_task():
    try:
        me = _me()
        if not _is_authorized(me):
            return jsonify({"error": "Not authorized to create tasks"}), 403

        title               = (request.form.get("title") or "").strip()
        description         = request.form.get("description") or ""
        assigned_to_id      = request.form.get("assigned_to_id")
        assigned_department = request.form.get("assigned_department") or None
        assigned_date_str   = request.form.get("assigned_date")
        due_date_str        = request.form.get("due_date")
        priority            = request.form.get("priority", "medium")
        remarks             = request.form.get("remarks") or ""

        if not title:
            return jsonify({"error": "Title is required"}), 400
        if not due_date_str:
            return jsonify({"error": "Due date is required"}), 400
        if not assigned_to_id and not assigned_department:
            return jsonify({"error": "Provide an assignee or a department"}), 400

        assigned_to = None
        assigned_to_name = None
        if assigned_to_id:
            assigned_to = StaffUser.query.get(int(assigned_to_id))
            if not assigned_to:
                return jsonify({"error": "Staff user not found in staff_management"}), 404
            assigned_to_name = getattr(assigned_to, "name", None)

        me_name  = getattr(me, "name", "CEO") or "CEO"
        me_email = getattr(me, "email", "") or ""

        t = TodoTask(
            task_number=_next_task_number(),
            title=title,
            description=description,
            assigned_to_id=assigned_to.id if assigned_to else None,
            assigned_to_name=assigned_to_name,
            assigned_department=assigned_department,
            assigned_by_id=me.id,
            assigned_by_name=me_name,
            assigned_by_email=me_email,
            assigned_date=datetime.fromisoformat(assigned_date_str).date()
                if assigned_date_str else date.today(),
            due_date=datetime.fromisoformat(due_date_str).date(),
            priority=priority,
            remarks=remarks,
            status="pending",
        )

        f = request.files.get("attachment")
        if f and f.filename:
            t.attachment_data = f.read()
            t.attachment_filename = f.filename
            t.attachment_mimetype = f.mimetype

        db.session.add(t)
        db.session.flush()

        _log(t.id, "created", me.id, changed_by_name=me_name,
             new_value=title, note="Task created")

        targets = []
        if assigned_to:
            targets.append(assigned_to)
        elif assigned_department:
            targets = StaffUser.query.filter(
                StaffUser.department == assigned_department
            ).all()

        for u in targets:
            _add_notification(u.id,
                f"New task assigned: {title} (Due {due_date_str})", t.id)

        db.session.commit()

        try:
            from email_templates import send_branded_email
        except ImportError:
            send_branded_email = None

        if send_branded_email:
            for u in targets:
                try:
                    send_branded_email(
                        recipient=getattr(u, "email", "") or "",
                        subject=f"New Task Assigned – {title}",
                        heading="New Task Assigned",
                        intro=f"You have been assigned a new task by {me_name}.",
                        details={
                            "Task ID": t.task_number,
                            "Title": title,
                            "Priority": priority.title(),
                            "Due Date": due_date_str,
                            "Assigned By": me_name,
                        },
                        message=remarks or description or None,
                        closing="Please log in to the Staff Portal to view and update this task.",
                    )
                except Exception as me_err:
                    print(f"[todo] email to {getattr(u,'email','?')} failed: {me_err}")

        return jsonify({"message": "Task created", "task": _serialize(t)}), 201
    except Exception as e:
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ───────────────────────────────────────────── list
@todo_admin_bp.route("/", methods=["GET"])
@jwt_required()
def list_tasks():
    try:
        q = TodoTask.query
        status = request.args.get("status")
        if status and status != "all":
            q = q.filter(TodoTask.status == status)
        dept = request.args.get("department")
        if dept:
            q = q.filter(TodoTask.assigned_department == dept)
        tasks = q.order_by(TodoTask.created_at.desc()).all()
        return jsonify({"tasks": [_serialize(t) for t in tasks]}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ───────────────────────────────────────────── get one
@todo_admin_bp.route("/<int:task_id>", methods=["GET"])
@jwt_required()
def get_task(task_id):
    try:
        t = TodoTask.query.get(task_id)
        if not t:
            return jsonify({"error": "Not found"}), 404
        return jsonify({"task": _serialize(t)}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ───────────────────────────────────────────── update
@todo_admin_bp.route("/<int:task_id>", methods=["PUT"])
@jwt_required()
def update_task(task_id):
    try:
        me = _me()
        if not _is_authorized(me):
            return jsonify({"error": "Not authorized"}), 403
        t = TodoTask.query.get(task_id)
        if not t:
            return jsonify({"error": "Not found"}), 404

        me_name = getattr(me, "name", "CEO") or "CEO"
        changes = []

        def _set(field, new_val):
            old = getattr(t, field)
            if old != new_val:
                setattr(t, field, new_val)
                changes.append(f"{field}: {old} → {new_val}")

        if "title" in request.form:
            _set("title", request.form.get("title"))
        if "description" in request.form:
            _set("description", request.form.get("description"))
        if "assigned_to_id" in request.form:
            v = request.form.get("assigned_to_id")
            if v:
                su = StaffUser.query.get(int(v))
                if not su:
                    return jsonify({"error": "Staff user not found"}), 404
                _set("assigned_to_id", su.id)
                _set("assigned_to_name", getattr(su, "name", None))
            else:
                _set("assigned_to_id", None)
                _set("assigned_to_name", None)
        if "assigned_department" in request.form:
            _set("assigned_department", request.form.get("assigned_department") or None)
        if "due_date" in request.form:
            v = request.form.get("due_date")
            _set("due_date", datetime.fromisoformat(v).date() if v else None)
        if "priority" in request.form:
            _set("priority", request.form.get("priority"))
        if "status" in request.form:
            new_status = request.form.get("status")
            if new_status != t.status:
                old_status = t.status
                t.status = new_status
                t.completed_at = datetime.utcnow() if new_status == "completed" else None
                changes.append(f"status: {old_status} → {new_status}")
        if "remarks" in request.form:
            _set("remarks", request.form.get("remarks"))

        f = request.files.get("attachment")
        if f and f.filename:
            t.attachment_data = f.read()
            t.attachment_filename = f.filename
            t.attachment_mimetype = f.mimetype
            changes.append("attachment updated")

        if changes:
            _log(t.id, "updated", me.id, changed_by_name=me_name,
                 new_value="; ".join(changes))
        db.session.commit()

        return jsonify({"message": "Updated", "task": _serialize(t)}), 200
    except Exception as e:
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ───────────────────────────────────────────── delete
@todo_admin_bp.route("/<int:task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    try:
        me = _me()
        if not _is_authorized(me):
            return jsonify({"error": "Not authorized"}), 403
        t = TodoTask.query.get(task_id)
        if not t:
            return jsonify({"error": "Not found"}), 404
        me_name = getattr(me, "name", "CEO") or "CEO"
        db.session.add(TodoTaskHistory(
            task_id=t.id, action="deleted",
            changed_by_id=me.id, changed_by_name=me_name,
            old_value=t.title, note="Task deleted",
        ))
        db.session.delete(t)
        db.session.commit()
        return jsonify({"message": "Deleted"}), 200
    except Exception as e:
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ───────────────────────────────────────────── download
@todo_admin_bp.route("/<int:task_id>/attachment", methods=["GET"])
@jwt_required()
def download_attachment(task_id):
    try:
        t = TodoTask.query.get(task_id)
        if not t or not t.attachment_data:
            return jsonify({"error": "No attachment"}), 404
        return send_file(
            io.BytesIO(t.attachment_data),
            mimetype=t.attachment_mimetype or "application/octet-stream",
            as_attachment=True,
            download_name=t.attachment_filename or f"task_{task_id}",
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ───────────────────────────────────────────── history (enhanced with titles)
@todo_admin_bp.route("/history", methods=["GET"])
@jwt_required()
def history():
    try:
        task_id = request.args.get("task_id")
        q = TodoTaskHistory.query
        if task_id:
            q = q.filter(TodoTaskHistory.task_id == int(task_id))
        rows = q.order_by(TodoTaskHistory.created_at.desc()).limit(1000).all()

        # Attach task titles for nicer display
        ids = {r.task_id for r in rows if r.task_id}
        titles = {}
        if ids:
            for t in TodoTask.query.filter(TodoTask.id.in_(ids)).all():
                titles[t.id] = t.title

        return jsonify({"history": [{
            "id": r.id,
            "task_id": r.task_id,
            "task_title": titles.get(r.task_id),
            "action": r.action,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "changed_by_id": r.changed_by_id,
            "changed_by_name": r.changed_by_name,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ───────────────────────────────────────────── staff dropdown sources
@todo_admin_bp.route("/assignable-users", methods=["GET"])
@jwt_required()
def assignable_users():
    try:
        users = (
            StaffUser.query
            .filter(StaffUser.is_active.is_(True))
            .order_by(StaffUser.name)
            .all()
        )
        return jsonify({"users": [{
            "id": u.id,
            "name": getattr(u, "name", f"User {u.id}"),
            "email": getattr(u, "email", ""),
            "department": getattr(u, "department", None),
            "designation": getattr(u, "designation", None),
            "role": getattr(u, "role", None),
        } for u in users]}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@todo_admin_bp.route("/departments", methods=["GET"])
@jwt_required()
def departments():
    try:
        rows = (
            db.session.query(StaffUser.department)
            .filter(StaffUser.department.isnot(None))
            .filter(StaffUser.department != "")
            .distinct()
            .all()
        )
        depts = sorted({r[0] for r in rows if r[0]})
        return jsonify({"departments": depts}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500