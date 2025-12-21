from django.urls import path
from . import views

urlpatterns = [
    path('', views.MessageCreateAPIView.as_view(), name='messages-create'),
    path('<str:message_id>/raw/', views.MessageRawCreateAPIView.as_view(), name='messages-raw'),
]
