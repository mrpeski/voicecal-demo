class AppError(Exception):
    code: str = "app_error"
    status_code: int = 500

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class ValidationError(AppError):
    code = "validation_error"
    status_code = 422


class NotFoundError(AppError):
    code = "not_found"
    status_code = 404


class ProviderError(AppError):
    code = "provider_error"
    status_code = 502


class ToolError(AppError):
    code = "tool_error"
    status_code = 500
