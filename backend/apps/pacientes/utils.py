def normalizar_rut(rut: str) -> str:
    """Normalize a Chilean RUT: remove dots, hyphens, uppercase, strip whitespace."""
    if not rut:
        return ""
    return rut.replace(".", "").replace("-", "").upper().strip()
