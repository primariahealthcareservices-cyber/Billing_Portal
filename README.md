class TodoTask(db.Model):
    __tablename__ = "todo_tasks"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    assigned_to_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    assigned_to_department = db.Column(db.String(100), nullable=True)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    assigned_date = db.Column(db.Date, nullable=False, default=date.today)
    due_date = db.Column(db.Date, nullable=True)
    priority = db.Column(db.String(20), default="Medium")   # Low / Medium / High / Urgent
    status = db.Column(db.String(20), default="Pending")    # Pending / In Progress / Completed
    remarks = db.Column(db.Text)
    attachment_path = db.Column(db.String(500))
    attachment_filename = db.Column(db.String(255))
    completed_at = db.Column(db.DateTime)
    completed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "assigned_to_user_id": self.assigned_to_user_id,
            "assigned_to_department": self.assigned_to_department,
            "assigned_by_user_id": self.assigned_by_user_id,
            "assigned_date": self.assigned_date.isoformat() if self.assigned_date else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "priority": self.priority,
            "status": self.status,
            "remarks": self.remarks,
            "attachment_path": self.attachment_path,
            "attachment_filename": self.attachment_filename,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "completed_by": self.completed_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TodoTaskHistory(db.Model):
    __tablename__ = "todo_task_history"
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("todo_tasks.id"), nullable=False)
    action = db.Column(db.String(50), nullable=False)   # created / assigned / updated / status_changed / completed / deleted
    old_status = db.Column(db.String(20))
    new_status = db.Column(db.String(20))
    performed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    performer_name = db.Column(db.String(255))
    remarks = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "task_id": self.task_id, "action": self.action,
            "old_status": self.old_status, "new_status": self.new_status,
            "performed_by": self.performed_by, "performer_name": self.performer_name,
            "remarks": self.remarks,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }