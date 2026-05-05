# Generado por Django 5.1.7 el 2026-05-05 17:02

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pacientes', '0008_paciente_fecha_ultima_inasistencia_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='diagnosticocatalogo',
            name='categoria',
            field=models.CharField(choices=[('BORRADOR', 'No categorizado'), ('MAS65', 'Mayor o igual 65'), ('OA_MENOS65', 'OA menor 65'), ('HOMBROS', 'Hombros'), ('LUMBAGOS', 'Lumbagos'), ('SDNT', 'SDNT'), ('SDT', 'SDT'), ('OTROS_NEUROS', 'Otros neuros'), ('AATT', 'AATT'), ('DUPLA', 'Dupla')], max_length=20),
        ),
        migrations.AlterField(
            model_name='movimientopaciente',
            name='estado_anterior',
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
        migrations.AlterField(
            model_name='movimientopaciente',
            name='estado_nuevo',
            field=models.CharField(max_length=30),
        ),
        migrations.AlterField(
            model_name='paciente',
            name='categoria',
            field=models.CharField(choices=[('BORRADOR', 'No categorizado'), ('MAS65', 'Mayor o igual 65'), ('OA_MENOS65', 'OA menor 65'), ('HOMBROS', 'Hombros'), ('LUMBAGOS', 'Lumbagos'), ('SDNT', 'SDNT'), ('SDT', 'SDT'), ('OTROS_NEUROS', 'Otros neuros'), ('AATT', 'AATT'), ('DUPLA', 'Dupla')], max_length=20),
        ),
        migrations.AlterField(
            model_name='paciente',
            name='estado',
            field=models.CharField(choices=[('PENDIENTE', 'Pendiente'), ('INGRESADO', 'Ingresado'), ('RESCATE', 'Rescate'), ('ABANDONO', 'Abandono'), ('ALTA_MEDICA', 'Alta medica'), ('EGRESO_VOLUNTARIO', 'Egreso voluntario'), ('EGRESO_ADMINISTRATIVO', 'Egreso administrativo'), ('DERIVADO', 'Derivado')], db_index=True, default='PENDIENTE', max_length=30),
        ),
    ]
