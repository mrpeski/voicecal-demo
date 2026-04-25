# syntax=docker/dockerfile:1.7
#
# Lambda container with AWS Lambda Web Adapter.
# The Web Adapter is a runtime extension pulled from a public ECR image; it lets
# us run an unmodified FastAPI + uvicorn server inside Lambda without rewriting
# to a handler. It speaks to uvicorn on localhost:8000 and translates Lambda
# invocations (including streaming responses) to/from HTTP.

FROM public.ecr.aws/lambda/python:3.12

# Copy the Web Adapter extension binary into /opt/extensions (Lambda auto-loads
# anything in this directory as an extension).
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 \
     /lambda-adapter /opt/extensions/lambda-adapter

# Web Adapter config (env vars it reads on boot):
#   PORT                       — port uvicorn listens on
#   AWS_LWA_INVOKE_MODE        — "response_stream" enables SSE passthrough
#   AWS_LWA_READINESS_CHECK_PATH — adapter polls this before routing traffic
ENV PORT=8000 \
    AWS_LWA_INVOKE_MODE=response_stream \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install deps
WORKDIR /var/task
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code — matches your layout: src/voicecal/app.py exposes `app`
COPY src ./src
ENV PYTHONPATH=/var/task/src

# The Lambda base image normally expects a handler; Web Adapter overrides that
# by making the container's entrypoint `uvicorn`. We bypass the default CMD.
ENTRYPOINT []
CMD ["python", "-m", "uvicorn", "voicecal.app:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
