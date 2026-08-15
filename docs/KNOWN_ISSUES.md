# Problemas conocidos — 0.9.0-beta.1

## Errores abiertos

No hay errores críticos, altos o medios conocidos después de la regresión de la Fase 9.

## Limitaciones aceptadas de la beta

| ID | Nivel | Limitación | Impacto / tratamiento |
| --- | --- | --- | --- |
| KI-001 | Bajo | Los sonidos son tonos sintetizados con Web Audio, no grabaciones finales | Funcionales y sin recursos externos; evaluar volumen con jugadores reales |
| KI-002 | Esperado | Salas y partidas viven únicamente en memoria | Reiniciar Node elimina todo; persistencia queda fuera del alcance actual |
| KI-003 | Verificación pendiente | No se probó hardware móvil ni teclado virtual real | Cubierto parcialmente por 9 viewports; ejecutar checklist en teléfonos |
| KI-004 | Verificación pendiente | Firefox y Safari no estaban disponibles | Edge y Chrome pasan; repetir manualmente si están disponibles |
| KI-005 | Verificación pendiente | No se ejecutó un lector de pantalla | Estructura, etiquetas, foco y regiones se auditaron; validar con NVDA/VoiceOver/TalkBack |
| KI-006 | Pendiente | No existe todavía una URL pública verificada | El proyecto está preparado para Render; seguir `DEPLOY_RENDER.md` con el repositorio dedicado |
| KI-007 | Esperado | Render Free duerme tras inactividad y puede tardar cerca de un minuto en despertar | La UI informa y permite reintentar; coordinar el acceso antes de una sesión |
| KI-008 | Esperado | Suspensión, reinicio, rollback o despliegue elimina todas las salas | Arquitectura de una instancia y memoria aceptada; los grupos deben crear otra sala |
| KI-009 | Verificación pendiente | No se probó HTTPS/WSS desde dos redes reales | Completar `PRODUCTION_CHECKLIST.md` después de obtener la URL pública |

Estas limitaciones no impiden preparar la beta, pero KI-006 y KI-009 deben cerrarse antes de afirmar que está publicada y verificada.
