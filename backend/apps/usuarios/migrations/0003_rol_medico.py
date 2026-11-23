"""El rol Administrativo pasa a ser Médico (carga de derivaciones desde TrakCare).

Los llamados quedan en manos del kinesiólogo, que contacta a su propia cartera.
"""

from django.db import migrations, models


def administrativo_a_medico(apps, schema_editor):
    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(rol="ADMINISTRATIVO").update(rol="MEDICO")


def medico_a_administrativo(apps, schema_editor):
    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(rol="MEDICO").update(rol="ADMINISTRATIVO")


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0002_usuario_requiere_cambio_password"),
    ]

    operations = [
        migrations.RunPython(administrativo_a_medico, medico_a_administrativo),
        migrations.AlterField(
            model_name="usuario",
            name="rol",
            field=models.CharField(
                choices=[("KINE", "Kinesiólogo"), ("MEDICO", "Médico"), ("ADMIN", "Administrador")],
                default="KINE",
                max_length=20,
            ),
        ),
    ]
