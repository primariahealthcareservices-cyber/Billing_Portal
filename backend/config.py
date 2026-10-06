# backend/config.py
import os
from datetime import timedelta
from dotenv import load_dotenv
import redis
from cachetools import TTLCache

load_dotenv()


class CacheClient:
    def __init__(self, redis_client=None, fallback_cache=None):
        self.redis = redis_client
        self.cache = fallback_cache
        self.use_redis = redis_client is not None

    def setex(self, key, time, value):
        if self.use_redis:
            self.redis.setex(key, time, value)
        else:
            self.cache[key] = value

    def get(self, key):
        if self.use_redis:
            return self.redis.get(key)
        return self.cache.get(key)

    def delete(self, key):
        if self.use_redis:
            self.redis.delete(key)
        else:
            if key in self.cache:
                del self.cache[key]


class Config:
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
    DB_NAME = os.getenv("DB_NAME", "billing_portal")
    SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_INVOICE_BYTES = 10 * 1024 * 1024

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 12)))

    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 465))
    MAIL_USE_SSL = os.getenv("MAIL_USE_SSL", "True").lower() == "true"
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    JWT_QUERY_STRING_NAME = "token"
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    @staticmethod
    def get_redis():
        try:
            redis_client = redis.from_url(Config.REDIS_URL)
            redis_client.ping()
            print("✅ Redis connected, using Redis cache.")
            return CacheClient(redis_client=redis_client)
        except Exception as e:
            print(f"⚠️ Redis unavailable ({e}) – falling back to in‑memory TTLCache.")
            return CacheClient(fallback_cache=TTLCache(maxsize=1000, ttl=600))