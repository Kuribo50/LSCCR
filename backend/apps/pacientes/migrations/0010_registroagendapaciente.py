# Generado por Django 5.1.7 el 2026-05-06 15:53

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pacientes', '0009_alter_diagnosticocatalogo_categoria_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RegistroAgendaPaciente',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha_programada', models.DateTimeField()),
                ('resultado', models.CharField(choices=[('ASISTIO', 'Asistió'), ('NO_ASISTIO', 'No asistió'), ('REAGENDADO', 'Reagendado'), ('CANCELADO', 'Cita eliminada')], max_length=20)),
                ('observacion', models.TextField(blank=True, default='')),
                ('nueva_fecha', models.DateTimeField(blank=True, null=True)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('paciente', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='registros_agenda', to='pacientes.paciente')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-creado_en', '-id'],
            },
        ),
    ]
