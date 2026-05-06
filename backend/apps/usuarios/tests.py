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

    def test_admin_puede_cambiar_administrativo_existente_a_kine(self):
        administrativo = Usuario.objects.create_user(
            rut="77.777.777-7",
            password="testpass123",
            nombre="Administrativo Cambio",
            rol=Usuario.Rol.ADMINISTRATIVO,
        )

        response = self.client.patch(
            f"/api/usuarios/{administrativo.id}/",
            {"rol": Usuario.Rol.KINE},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        administrativo.refresh_from_db()
        self.assertEqual(administrativo.rol, Usuario.Rol.KINE)

    def test_usuario_no_admin_no_puede_gestionar_usuarios(self):
        kine = Usuario.objects.create_user(
            rut="88.888.888-8",
            password="testpass123",
            nombre="Kine Sin Permiso",
            rol=Usuario.Rol.KINE,
        )
        self.client.force_authenticate(kine)

        response = self.client.get("/api/usuarios/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_puede_resetear_password_con_ultimos_4_digitos_del_rut(self):
        usuario = Usuario.objects.create_user(
            rut="12.345.678-K",
            password="testpass123",
            nombre="Usuario Reset",
            rol=Usuario.Rol.KINE,
        )

        response = self.client.post(f"/api/usuarios/{usuario.id}/reset-password/", format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usuario.refresh_from_db()
        self.assertTrue(usuario.check_password("5678"))
        self.assertTrue(usuario.requiere_cambio_password)

    def test_usuario_no_admin_no_puede_resetear_password(self):
        objetivo = Usuario.objects.create_user(
            rut="12.345.679-8",
            password="testpass123",
            nombre="Usuario Objetivo",
            rol=Usuario.Rol.KINE,
        )
        kine = Usuario.objects.create_user(
            rut="99.999.999-9",
            password="testpass123",
            nombre="Kine Sin Reset",
            rol=Usuario.Rol.KINE,
        )
        self.client.force_authenticate(kine)

        response = self.client.post(f"/api/usuarios/{objetivo.id}/reset-password/", format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        objetivo.refresh_from_db()
        self.assertTrue(objetivo.check_password("testpass123"))

    def test_cambiar_password_acepta_minimo_6_caracteres_y_limpia_flag(self):
        usuario = Usuario.objects.create_user(
            rut="10.000.000-0",
            password="1234",
            nombre="Usuario Cambio Obligatorio",
            rol=Usuario.Rol.KINE,
            requiere_cambio_password=True,
        )
        self.client.force_authenticate(usuario)

        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "1234",
                "new_password": "abc123",
                "confirm_password": "abc123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usuario.refresh_from_db()
        self.assertTrue(usuario.check_password("abc123"))
        self.assertFalse(usuario.requiere_cambio_password)

    def test_cambiar_password_rechaza_menos_de_6_caracteres(self):
        usuario = Usuario.objects.create_user(
            rut="10.000.001-9",
            password="1234",
            nombre="Usuario Cambio Corto",
            rol=Usuario.Rol.KINE,
            requiere_cambio_password=True,
        )
        self.client.force_authenticate(usuario)

        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "1234",
                "new_password": "abc12",
                "confirm_password": "abc12",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        usuario.refresh_from_db()
        self.assertTrue(usuario.requiere_cambio_password)
