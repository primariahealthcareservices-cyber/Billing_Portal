# backend/routes/salesenterprise.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from models import db, SalesEnterpriseKPI
from utils import role_required

salesenterprise_bp = Blueprint("salesenterprise", __name__, url_prefix="/api/salesenterprise")

@salesenterprise_bp.route("/kpis", methods=["GET"])
@role_required("SalesEnterprise")
def get_kpis():
    year = request.args.get("year", type=int)
    quarter = request.args.get("quarter")
    department = request.args.get("department")
    month = request.args.get("month")
    query = SalesEnterpriseKPI.query
    if year:
        query = query.filter_by(year=year)
    if quarter:
        query = query.filter_by(quarter=quarter)
    if department:
        query = query.filter_by(department=department)
    if month:
        query = query.filter_by(month=month)
    kpis = query.order_by(
        SalesEnterpriseKPI.year.desc(),
        SalesEnterpriseKPI.quarter.desc(),
        SalesEnterpriseKPI.department,
        SalesEnterpriseKPI.month
    ).all()
    return jsonify({"kpis": [k.to_dict() for k in kpis]}), 200

@salesenterprise_bp.route("/kpis", methods=["POST"])
@role_required("SalesEnterprise")
def create_kpi():
    data = request.get_json(silent=True) or {}
    if not data.get("year") or not data.get("quarter"):
        return jsonify({"message": "Year and quarter are required."}), 400
    
    dept = data.get("department", "IT")
    mon = data.get("month", "January")

    kpi = SalesEnterpriseKPI(
        year=data["year"],
        quarter=data["quarter"],
        department=dept,
        month=mon,
        revenue_growth=data.get("revenue_growth"),
        win_rate=data.get("win_rate"),
        stage_conversion=data.get("stage_conversion"),
        pipeline_coverage=data.get("pipeline_coverage"),
        sales_cycle_length=data.get("sales_cycle_length"),
        cac=data.get("cac"),
        rep_productivity=data.get("rep_productivity"),
        ramp_time=data.get("ramp_time"),
        lead_response_time=data.get("lead_response_time"),
        nrr=data.get("nrr"),
        quota_attainment=data.get("quota_attainment"),
        forecast_accuracy=data.get("forecast_accuracy"),
        created_by_id=get_jwt_identity(),
    )
    db.session.add(kpi)
    db.session.commit()
    return jsonify({"message": "KPI created", "kpi": kpi.to_dict()}), 201

@salesenterprise_bp.route("/kpis/<int:kpi_id>", methods=["PUT"])
@role_required("SalesEnterprise")
def update_kpi(kpi_id):
    kpi = SalesEnterpriseKPI.query.get(kpi_id)
    if not kpi:
        return jsonify({"message": "KPI not found."}), 404
    data = request.get_json(silent=True) or {}

    updatable_fields = [
        "revenue_growth", "win_rate", "stage_conversion", "pipeline_coverage",
        "sales_cycle_length", "cac", "rep_productivity", "ramp_time",
        "lead_response_time", "nrr", "quota_attainment", "forecast_accuracy",
        "department", "month", "year", "quarter"
    ]
    for field in updatable_fields:
        if field in data and data[field] is not None:
            setattr(kpi, field, data[field])

    db.session.commit()
    return jsonify({"message": "KPI updated", "kpi": kpi.to_dict()}), 200

@salesenterprise_bp.route("/kpis/<int:kpi_id>", methods=["DELETE"])
@role_required("SalesEnterprise")
def delete_kpi(kpi_id):
    kpi = SalesEnterpriseKPI.query.get(kpi_id)
    if not kpi:
        return jsonify({"message": "KPI not found."}), 404
    db.session.delete(kpi)
    db.session.commit()
    return jsonify({"message": "KPI deleted."}), 200