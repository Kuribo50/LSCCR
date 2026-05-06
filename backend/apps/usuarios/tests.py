from rest_framework import status
from rest_framework.test import APITestCase

from .models import Usuario


class UsuarioAdminTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            rut="66666666-K",
            password="testpass123",
            nombre="Admin Test",
            rol=Usuario.Rol.ADMIN,
        )
        self.client.force_authenticate(self.admin)

    def test_admin_puede_crear_usuario_con_rut_normalizado(self):
        response = self.client.post(
            "/api/usuarios/",
            {
                "rut": "11.111.111-1",
                "nombre": "Kine Nuevo",
                "rol": Usuario.Rol.KINE,
                "password": "testpass123",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        usuario = Usuario.objects.get(nombre="Kine Nuevo")
        self.assertEqual(usuario.rut, "111111111")

    def test_admin_puede_actualizar_rut_de_usuario(self):
        usuario = Usuario.objects.create_user(
            rut="22222222-2",
            password="testpass123",
            nombre="Usuario Editable",
            rol=Usuario.Rol.KINE,
        )

        response = self.client.patch(
            f"/api/usuarios/{usuario.id}/",
            {"rut": "33.333.333-3", "nombre": usuario.nombre},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usuario.refresh_from_db()
        self.assertEqual(usuario.rut, "333333333")

    def test_no_permite_rut_duplicado_normalizado(self):
        Usuario.objects.create_user(
            rut="44.444.444-4",
            password="testpass123",
            nombre="Usuario Existente",
            rol=Usuario.Rol.KINE,
        )

        response = self.client.post(
            "/api/usuarios/",
            {
                "rut": "444444444",
                "nombre": "Duplicado",
                "rol": Usuario.Rol.KINE,
                "password": "testpass123",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rut", response.data)

    def test_no_permite_rut_vacio(self):
        response = self.client.post(
            "/api/usuarios/",
            {
                "rut": "",
                "nombre": "Sin Rut",
                "rol": Usuario.Rol.KINE,
                "password": "testpass123",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rut", response.data)

    def test_usuario_administrativo_existente_sigue_funcionando(self):
        administrativo = Usuario.objects.create_user(
            rut="55.555.555-5",
            password="testpass123",
            nombre="Administrativo Existente",
            rol=Usuario.Rol.ADMINISTRATIVO,
        )

        response = self.client.get("/api/usuarios/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = next(usuario for usuario in response.data if usuario["id"] == administrativo.id)
        self.assertEqual(item["rol"], Usuario.Rol.ADMINISTRATIVO)
