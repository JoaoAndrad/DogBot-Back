import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()

if __name__ == "__main__":
    # Run startup checks / initializer to produce logs when app.py is used as the start command
    try:
        from django.core.management import call_command
        print("[app] Running init_service checks (wait for DB)...")
        # call_command will print/log messages from the management command
        call_command("init_service", "--wait-db")
        print("[app] init_service completed")
    except Exception as e:
        print(f"[app] init_service failed: {e}")

    from wsgiref.simple_server import make_server
    port = int(os.environ.get("PORT", "8000"))
    print(f"Serving on 0.0.0.0:{port}")
    httpd = make_server("", port, application)
    httpd.serve_forever()
