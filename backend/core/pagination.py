from rest_framework.pagination import PageNumberPagination


class FlexiblePagination(PageNumberPagination):
    """Default 100 per page, but a client can request up to 2000 with ?page_size=.
    A 200-position Gantt then loads in one request instead of silently losing rows."""
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 2000
