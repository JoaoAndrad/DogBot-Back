from django.urls import path

from . import views

urlpatterns = [
    path("", views.PollListCreateAPIView.as_view(), name="polls-list-create"),
    path("<str:msg_id>/", views.PollDetailAPIView.as_view(), name="polls-detail"),
    path("<str:msg_id>/votes/", views.VoteCreateAPIView.as_view(), name="polls-votes"),
]
