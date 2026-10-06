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
