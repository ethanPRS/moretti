# Bitácora diaria · Sprint 2 (5–9 oct)

Tres renglones por persona al cerrar el día (qué quedó, qué sigue, qué me
bloquea). La lee el otro antes del daily de las 9:00. El detalle de cada
avance de Ethan va debajo, en «Registro de trabajo», en el orden en que se
hizo.

---

## Lunes 5 de octubre

**Ethan** (trabajo hecho por Claude a nombre de Ethan)

- **Quedó:** Q, R y S terminadas y probadas en `ethan/sprint-2` (3 commits,
  54 pruebas nuevas, 159 en verde, build limpio), probadas también en el
  navegador. Documentación: decisiones D-22 a D-31, `versionado-del-plan.md`,
  reglas, modelo de datos, parámetros, pruebas, tablero, impedimentos y notas
  para Charly. Q, R y S cerradas en ClickUp.
- **Sigue:** que Ethan revise y ratifique D-22 a D-31; PR de `ethan/sprint-2`
  a `main` y revisión de Charly; cerrar los PR #1 y #2; aclarar I-6 en el
  daily; mandar a Ana Cris la pregunta de reintentos (I-7) y al contador la
  de feriados (D-30).
- **Me bloquea:** nada para lo mío. Para cerrar W + X: la revisión cruzada y
  la parte de Charly.

**Charly**

- **Quedó:**
- **Sigue:**
- **Me bloquea:**

### Registro de trabajo de Ethan · lunes 5

1. **Integración (antes del sprint).** Los PR #1 y #2 de Charly salían del
   `main` del 10 de sep y borraban ~10 000 líneas (motor, pruebas, pasarela).
   Se rescató lo útil de su commit `fbd5960` sobre la rama integrada
   (`sprint-2/base`, PR #3, ya fusionado en `main`). Ese commit traía
   marcadores de conflicto sin resolver en `CobrarButton.tsx` y
   `planes/[id]/page.tsx`: esa parte no se trajo. De paso se corrigió
   `create-payment-intent` (buscaba el intent en la cuenta de la plataforma,
   no en la conectada) y el build de producción, que ya no compilaba.
2. **`main` local al día**, base `moretti_dev` recreada con las 7
   migraciones, 105 pruebas en verde. Rama de trabajo: `ethan/sprint-2`.
3. **Alcance de Ethan en ClickUp** (lista «Sprint 2 · 5–9 oct»): Q (reglas
   cruzadas de las tres máquinas, vence el miércoles 7), R (adelanto y
   liquidación con versionado) y S (pendiente de comprobante fiscal). W + X
   (pruebas, revisión, documentación, review y retro) es de los dos.
4. **Hallazgo para el daily:** en ClickUp, «CHARLY · O — Cobro programado de
   las mensualidades» está *complete* desde el 4 de oct, pero en GitHub no
   hay nada suyo después del 2 de oct. O no lo ha subido o se marcó antes de
   tiempo. Anotado como I-6 en `impedimentos.md`.
5. **Orden de trabajo:** Q primero (es urgente y R y S se apoyan en sus
   reglas), luego R, luego S.
6. **Q · reglas cruzadas** (`282bd41`). Módulo puro `operacion.ts` con las
   máquinas operativa e instalación y un motor `obra.ts` que aplica y deja
   evento. Al escribir la regla «APARTADO requiere contrato y anticipo»
   apareció que el camino del webhook de Stripe (`confirmarCobroStripe`)
   escribía el estado directo, sin la máquina, y además reabría un plan
   cancelado. Se unificó con el de la pasarela (D-24). Sección «Obra y
   entrega» en el back office: cierra B-7. 24 pruebas, todas en verde al
   primer intento.
7. **R · versionado** (`fd867fa`). Diseño en D-25 a D-29: cada exhibición
   lleva tipo y versión; lo sustituido se marca, no se borra; `VersionPlan`
   guarda la foto. El cálculo es puro y en centavos, para que la vista
   previa y el motor den lo mismo; una prueba recorre cientos de montos y
   comprueba R7 al centavo. Probado en el navegador: adelanto de $20,000 →
   de 12 a 10 exhibiciones, versión 2 vigente, la 1 consultable. Se aclaró
   en la pantalla que la foto de la versión se toma antes del cobro.
8. **S · comprobante fiscal** (`f6dd2e4`). Fechas límite verificadas contra
   el calendario real (5 dic 2026 sábado → lunes 7; 5 feb 2028 sábado → 8,
   porque el 7 es feriado; 5 feb 2029 es el feriado → 6). Se crea en la
   transacción del pago por los dos caminos. Pantalla «Fiscal» agrupada por
   fecha límite. En la prueba del navegador el servidor de desarrollo
   contestó 500: tenía en memoria el cliente de Prisma de antes de la
   migración; al reiniciarlo funcionó (no era el código).
9. **Cierre del día:** `npm test` 159/159, `tsc` y `eslint` limpios, `next
   build` compila. Documentación al día. Rama empujada a GitHub para la
   revisión de Charly.
10. **Dónde vive la tarjeta (H, abierta desde el Sprint 0): decidido.** En
    la plataforma, clonada a la cuenta de Moretti en cada cobro (D-32, sustituye
    a la provisional D-02). En seguridad de los datos las dos opciones son
    iguales (Stripe, PCI); se eligió por control: sólo el sistema puede
    cobrarle a la tarjeta, y una cuenta de Moretti comprometida no las expone.
    Queda abierta sólo la pregunta legal de quién es el comercio que cobra
    (I-9). Con esto Charly ya puede avanzar con K y O.
