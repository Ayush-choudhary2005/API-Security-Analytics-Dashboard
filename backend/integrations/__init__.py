"""
integrations package — Modular, provider-agnostic notification & active defense integrations.
"""

from .base import BaseNotificationProvider
from .slack import SlackProvider
from .discord import DiscordProvider
from .service import NotificationService, notification_service

__all__ = [
    "BaseNotificationProvider",
    "SlackProvider",
    "DiscordProvider",
    "NotificationService",
    "notification_service",
]
