"""Sectorización de pacientes a partir de NROFAMILIA y del nombre del sector.

Es la versión Python de la macro SectorizarSimple del CESFAM: convierte el número
de familia (p. ej. "CAR-A12-0345") y/o el sector del histórico en un código
(A1..A13 azul, R1..R10 rojo, V1..V10 verde, CB, CD) y de ahí en:

- color/centro -> Paciente.sector_cesfam   (AZUL, ROJO, VERDE, CECOSF ..., CESFAM ...)
- barrio       -> Paciente.sector_oficial  (FRUTILLARES, LOMA ALTA, LOS BLOQUES ...)
"""

import re
import unicodedata

MAX_SECTOR = {"A": 13, "R": 10, "V": 10}

CODIGO_A_SECTOR = {
    "A1": "CARLOS MAHNS", "A2": "OTROS AZULES", "A3": "CENTRO", "A4": "CENTENARIO",
    "A5": "CERRO NAVIDAD", "A6": "CERRO SAN JUAN", "A7": "FRUTILLARES",
    "A8": "CERRO ALEGRE CAR", "A9": "POBLACION EL COLO", "A10": "ALBERGUE MUNICIPAL",
    "A11": "VILLA LAS ARAUCARIAS", "A12": "LOS BOLDOS", "A13": "HOGAR SAN JOSE",
    "R1": "LOS BLOQUES", "R2": "MILADE ASFURA", "R3": "POBLACION 18 SEPTIEMBRE",
    "R4": "VILLA ALEMANIA", "R5": "LOS LAGOS", "R6": "COCHOLGUE", "R7": "OTROS ROJOS",
    "R8": "POBLACION EL MIRADOR", "R9": "DICHATO CAR", "R10": "COLIUMO CAR",
    "V1": "EL SANTO", "V2": "CERRO ESTANQUE", "V3": "OTROS VERDES",
    "V4": "HOGAR VILLA NAZARETH", "V5": "NACHUR - RAFAEL", "V6": "CECOSF EL SANTO",
    "V7": "CECOSF CERRO ESTANQUE", "V8": "FRUTILLAR ALTO", "V9": "HOGAR NAZARETH",
    "V10": "EXTRACOMUNA",
    "CB": "CESFAM BELLAVISTA", "CD": "CESFAM DICHATO",
}

NOMBRE_A_CODIGO = {
    "CARLOS MAHNS": "A1", "OTROS AZULES": "A2", "CENTRO": "A3", "CENTENARIO": "A4",
    "CERRO NAVIDAD": "A5", "NAVIDAD": "A5", "CERRO SAN JUAN": "A6", "SAN JUAN": "A6",
    "FRUTILLARES": "A7", "CERRO ALEGRE CAR": "A8", "CERRO ALEGRE": "A8",
    "POBLACION EL COLO": "A9", "POBL EL COLO": "A9", "ALBERGUE MUNICIPAL": "A10",
    "ALBERGUE BAQUEDANO": "A10", "VILLA LAS ARAUCARIAS": "A11", "LOS BOLDOS": "A12",
    "HOGAR SAN JOSE": "A13",
    "LOS BLOQUES": "R1", "MILADE ASFURA": "R2", "MILADE ASFURAS": "R2",
    "POBLACION 18 SEPTIEMBRE": "R3", "POBL 18 SEPTIEMBRE": "R3", "18 SEPTIEMBRE": "R3",
    "VILLA ALEMANIA": "R4", "LOS LAGOS": "R5", "COCHOLGUE": "R6", "OTROS ROJOS": "R7",
    "POBLACION EL MIRADOR": "R8", "POBL EL MIRADOR": "R8", "EL MIRADOR": "R8",
    "DICHATO CAR": "R9", "COLIUMO CAR": "R10", "COLIUMO": "R10", "P COLIUMO": "R10",
    "EL SANTO": "V1", "CERRO ESTANQUE": "V2", "OTROS VERDES": "V3", "CALIFORNIA": "V3",
    "HOGAR VILLA NAZARETH": "V4", "VILLA NAZARETH": "V4", "NACHUR RAFAEL": "V5",
    "POSTA RAFAEL": "V5", "P MENQUE": "V5", "CORONEY": "V5", "PUNTA DE PARRA": "V5",
    "CECOSF EL SANTO": "V6", "CECOSF CERRO ESTANQUE": "V7", "FRUTILLAR ALTO": "V8",
    "HOGAR NAZARETH": "V9", "EXTRACOMUNA": "V10",
    "CESFAM BELLAVISTA": "CB", "CESFAM DICHATO": "CD", "BELLAVISTA": "CB",
}

# Se prueban de la clave más larga a la más corta para que "CERRO ALEGRE CAR"
# gane sobre "CERRO ALEGRE".
_CLAVES_ORDENADAS = sorted(NOMBRE_A_CODIGO, key=len, reverse=True)
_SEPARADORES = re.compile(r"[-_.,;:/\\]")


def normalizar_nombre(valor: str) -> str:
    texto = unicodedata.normalize("NFD", str(valor or "").upper().strip())
    texto = texto.encode("ascii", "ignore").decode()
    texto = re.sub(r"\([^)]*\)", " ", texto)
    texto = _SEPARADORES.sub(" ", texto)
    return re.sub(r" +", " ", texto).strip()


def _compacto(valor: str) -> str:
    return re.sub(r"[ _.,/\\-]", "", str(valor or "").upper().strip())


def _digitos_iniciales(texto: str) -> str:
    return re.match(r"\d*", texto).group(0)


def _inferir_sector(color: str, digitos: str) -> int:
    """Número de sector válido, 0 si no hay dígitos o -1 si no cae en rango."""
    maximo = MAX_SECTOR.get(color, 0)
    if not maximo or not digitos:
        return 0
    if len(digitos) >= 2 and 1 <= int(digitos[:2]) <= maximo:
        return int(digitos[:2])
    if 1 <= int(digitos[0]) <= maximo:
        return int(digitos[0])
    return -1


def _codigo_desde_texto_compacto(valor: str) -> str:
    s = _compacto(valor)
    if not s:
        return ""
    if s[:2] in ("CB", "CD"):
        return s[:2]
    if s in ("A", "R", "V"):
        return s
    color = s[0]
    if color not in MAX_SECTOR:
        return ""
    digitos = _digitos_iniciales(s[1:])
    if not digitos:
        return ""
    numero = _inferir_sector(color, digitos)
    return f"{color}{numero}" if numero > 0 else color


def codigo_desde_familia(nro_familia: str) -> str:
    n = _compacto(nro_familia)
    if not n:
        return ""
    if n[:2] in ("CB", "CD"):
        return n[:2]
    if n[:3] == "CAR":
        n = n[3:]
    if not n:
        return ""
    color = n[0]
    if color not in MAX_SECTOR:
        return ""
    n = n[1:]
    while n and n[0] == color:
        n = n[1:]
    while n and not n[0].isdigit():
        n = n[1:]
    digitos = _digitos_iniciales(n)
    if not digitos:
        return color
    numero = _inferir_sector(color, digitos)
    return f"{color}{numero}" if numero > 0 else color


def codigo_desde_texto(valor: str) -> str:
    codigo = _codigo_desde_texto_compacto(valor)
    if codigo:
        return codigo
    nombre = normalizar_nombre(valor)
    if not nombre:
        return ""
    if nombre in NOMBRE_A_CODIGO:
        return NOMBRE_A_CODIGO[nombre]
    for clave in _CLAVES_ORDENADAS:
        if clave in nombre:
            return NOMBRE_A_CODIGO[clave]
    return ""


def elegir_codigo(cod_familia: str, cod_sector: str) -> str:
    if cod_familia and cod_sector:
        if cod_familia == cod_sector:
            return cod_familia
        if len(cod_familia) > 1 and len(cod_sector) == 1:
            return cod_familia
        if len(cod_sector) > 1 and len(cod_familia) == 1:
            return cod_sector
        return cod_familia if len(cod_familia) > 1 else cod_sector
    return cod_familia or cod_sector


def codigo_a_centro(codigo: str) -> str:
    if codigo == "V6":
        return "CECOSF EL SANTO"
    if codigo == "V7":
        return "CECOSF CERRO ESTANQUE"
    if codigo == "CB":
        return "CESFAM BELLAVISTA"
    if codigo == "CD":
        return "CESFAM DICHATO"
    return {"A": "AZUL", "R": "ROJO", "V": "VERDE"}.get(codigo[:1], "NO IDENTIFICABLE") if codigo else "NO IDENTIFICABLE"


def limpiar_barrio(sector: str) -> str:
    """Nombre del barrio tal como viene en el padrón, sin la sigla del centro.

    "LOMA ALTA (CB)" -> "LOMA ALTA", "POBL. 18 SEPTIEMBRE" -> "POBL. 18 SEPTIEMBRE".
    """
    texto = re.sub(r"\([^)]*\)", " ", str(sector or "").upper())
    return re.sub(r" +", " ", texto).strip()


def sectores_desde_codigo(codigo: str, sector: str = "") -> dict:
    """Traduce el código a los dos campos de la ficha.

    - sector_cesfam: color o centro (AZUL, ROJO, VERDE, CECOSF..., CESFAM ...).
    - sector_oficial: barrio donde vive. Con código numerado se usa el nombre
      canónico (A7 -> FRUTILLARES); si no (CB, CD o solo color) se usa el barrio
      del padrón ("LOMA ALTA").
    """
    centro = codigo_a_centro(codigo)
    if len(codigo) > 1 and codigo not in ("CB", "CD"):
        barrio = CODIGO_A_SECTOR.get(codigo, "")
    else:
        barrio = limpiar_barrio(sector)
    return {
        "codigo": codigo,
        "sector_cesfam": "" if centro == "NO IDENTIFICABLE" else centro,
        "sector_oficial": barrio,
    }


def sectorizar(nro_familia: str = "", sector: str = "") -> dict:
    """Código del CESFAM más sector_cesfam (color/centro) y sector_oficial (barrio)."""
    codigo = elegir_codigo(
        codigo_desde_familia(nro_familia),
        codigo_desde_texto(sector) if sector else "",
    )
    return sectores_desde_codigo(codigo, sector)
