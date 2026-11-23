"""Convierte el texto de Paciente.observaciones en entradas de ObservacionPaciente."""

from django.db import migrations


def migrar(apps, schema_editor):
    from apps.pacientes.services import separar_observaciones

    Paciente = apps.get_model("pacientes", "Paciente")
    ObservacionPaciente = apps.get_model("pacientes", "ObservacionPaciente")
    nuevas = []
    resumenes = []
    for paciente in Paciente.objects.exclude(observaciones="").iterator():
        if ObservacionPaciente.objects.filter(paciente_id=paciente.pk).exists():
            continue
        entradas = separar_observaciones(paciente.observaciones)
        for tipo, texto, fijada in entradas:
            nuevas.append(ObservacionPaciente(paciente_id=paciente.pk, tipo=tipo, texto=texto, fijada=fijada))
        orden = sorted(entradas, key=lambda e: not e[2])
        paciente.observaciones = " | ".join(texto for _t, texto, _f in orden)
        resumenes.append(paciente)
    ObservacionPaciente.objects.bulk_create(nuevas, batch_size=500)
    Paciente.objects.bulk_update(resumenes, ["observaciones"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [("pacientes", "0018_observacion_paciente")]
    operations = [migrations.RunPython(migrar, migrations.RunPython.noop)]
