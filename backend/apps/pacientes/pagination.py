from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    """Paginacion estandar con tamano de pagina configurable por el cliente.

    Query params aceptados:
      - ``page``: numero de pagina (1-based).
      - ``page_size``: registros por pagina (maximo ``max_page_size``).
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
