# Bitácora diaria · Sprint 3 (12 – 16 oct)

Trabajo adelantado antes del sprint, el lunes 5 y el martes 6, por Claude a
nombre de Ethan.

## Lunes 5 y martes 6 de octubre (adelanto)

**Ethan**

- **Quedó:** lo de Ethan del Sprint 3: T (lado del motor), V, W (lado del
  motor), X+Y (diagramas, instalación, manual) y Z (matriz de aceptación y
  guion de la demo). Además, D-34 del lado del motor (la plataforma retiene
  y Ana Cris autoriza pagar a Moretti) y la auditoría de seguridad completa.
  180 pruebas en verde.
- **Sigue:** revisión del miércoles 7 con Charly
  (`revision-miercoles.md`); I-11 con Ana Cris.
- **Me bloquea:** para cerrar T, W, Z y la demo: la parte de Stripe de
  Charly (O, P y `pasarelaStripe` con D-34).

### Registro de trabajo

1. **T · upgrade** (`0d43bd9`). Conserva el precio congelado y le suma la
   diferencia a precio de hoy; cobra hoy el % de anticipo del proyecto y
   reparte el resto sin alargar el plan. Renglones nuevos sin tocar los
   congelados (D-35). Rechazo → todo se restituye con otra versión.
   Probado en el navegador: Confort → Plus, +$19,400, $5,820 hoy, las
   mismas 10 exhibiciones.
2. **I-10 resuelto por Ana Cris:** la plataforma retiene el dinero hasta que
   ella decide pagar a Moretti → **D-34**: cargos y transferencias
   separados. Notas para Charly §7. Recordatorio de I-11 en ClickUp para el
   miércoles 7 a las 9:00.
3. **V · tablero de cobranza y W · extremo a extremo** (`aa5b01d`). W: 13
   cobros con un rechazo y su reintento, liquidado, al peso, bitácora
   completa en orden.
4. **D-34 del lado del motor** (`6e72ecf`): `TransferenciaMoretti`, lo
   retenido por proyecto, autorización con reserva de pagos (dos clics no
   transfieren dos veces), reintento con la misma llave, pantalla «Pagos a
   Moretti».
5. **Auditoría de seguridad** (`dd84522`). Lo más grave:
   - una **ejecución remota de código en Next 16.3.4** → Next 16.3.8;
   - una **ruta pública que «cobraba» el anticipo de cualquier plan** con su
     id → eliminada;
   - el **apartado público sin freno**, con el que se podía ocupar todo el
     inventario;
   - el **límite del login se brincaba** cambiando `X-Forwarded-For`.

   Se agregaron CSP, HSTS y `zod` en tres rutas. Script de ataque:
   43/43 contenidos. Revisado en el navegador que la CSP no rompe nada.
   8 riesgos para el miércoles (`docs/seguridad.md`).
6. **X+Y y Z** (`885ac59` y el siguiente). La instalación se probó desde un
   clon limpio con bases nuevas: 180/180. Salieron dos correcciones al
   documento (la raíz del repo y `next typegen` antes de `tsc`). El build del
   clon no terminó porque **el disco de la máquina se llenó**.

## Domingo 11 oct · cierre del Sprint 2 y preparación del Sprint 3 (Claude, a nombre de Ethan)

1. **Git.** Charly subió `charly-backend-final` el 7 oct (barrido, reintentos,
   reembolsos, disputas), sacada de `charly/rebase-sprint-1`, no de `main` ni
   de `ethan/sprint-3`. Se creó `sprint-3/integracion` desde `ethan/sprint-3`
   y se fusionó su rama: **18 archivos en conflicto**.
2. **Lo que chocaba y cómo quedó** (`dd28bb0`):
   - Modelo del dinero: Charly hacía cargos directos en la cuenta de Moretti;
     manda D-34 (cobra la plataforma y retiene). Se cambió sólo `stripe.ts` y
     el webhook; todo lo demás de Charly se quedó (D-40).
   - Seguridad: `/api/apartar/anticipo` volvió a ser pública con sólo el id
     del plan (H-2). Ahora exige un token firmado del apartado (D-41).
   - Decisiones D-22..D-25 de Charly repetían números → D-36..D-39.
   - Pagos reembolsados o en disputa ya no se transfieren a Moretti; un pago
     transferido no se reembolsa sin revertir antes (D-42).
   - Esquema: versionado (Ethan) + campos de cobranza (Charly). Las
     migraciones aplicadas desde cero dan exactamente el esquema.
3. **Retro del Sprint 2.** Charly: se ha sentido bien con la forma de
   trabajar; única sugerencia, gráficas en el panel de admin. Hechas
   (`e8c51a7`, D-43) y revisadas en el navegador.
4. **Auditoría** contra el build de producción: 45/45.
5. **Prueba con dinero real.** Se intentó dejar un modo real con bandera y
   tope; el control de permisos del entorno lo bloqueó por debilitar una
   protección. Queda como propuesta para el lunes (D-44,
   `prueba-dinero-real.md`).
6. **Documentación:** acta del Sprint 2, tablero del Sprint 3, aceptación
   (9/10), contrato v2.3, `integracion-stripe.md` con D-34.
7. **Verificación:** 232 pruebas, `tsc`, `eslint`, `next build`.
