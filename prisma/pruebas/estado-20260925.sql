--
-- PostgreSQL database dump
--

\restrict 99RHMpeuCkVHZkbuRNyrnbZRHr4ucdbAlDzSe3t2EVBqzmGQz7uzxMTcZlVspRp

-- Dumped from database version 16.15 (Homebrew)
-- Dumped by pg_dump version 16.15 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: EstadoExhibicion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoExhibicion" AS ENUM (
    'PENDIENTE',
    'PAGADA',
    'VENCIDA'
);


--
-- Name: EstadoFinanciero; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoFinanciero" AS ENUM (
    'COTIZADO',
    'APARTADO',
    'AL_CORRIENTE',
    'LIQUIDADO',
    'SUSPENDIDO',
    'CANCELADO'
);


--
-- Name: EstadoInstalacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoInstalacion" AS ENUM (
    'NO_PROGRAMADA',
    'PROGRAMADA',
    'INSTALADA',
    'ENTREGADA'
);


--
-- Name: EstadoOperativo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoOperativo" AS ENUM (
    'PENDIENTE',
    'LEVANTAMIENTO_HECHO',
    'ACABADOS_ELEGIDOS',
    'EN_PRODUCCION',
    'PRODUCIDO',
    'EN_ALMACEN'
);


--
-- Name: EstadoPlan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoPlan" AS ENUM (
    'COTIZADO',
    'ACTIVO',
    'LIQUIDADO',
    'CANCELADO'
);


--
-- Name: FamiliaPartida; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FamiliaPartida" AS ENUM (
    'A_LA_MEDIDA',
    'DE_CATALOGO',
    'VALE'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Comprador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Comprador" (
    id text NOT NULL,
    nombre text NOT NULL,
    contacto text NOT NULL,
    "unidadId" text NOT NULL,
    folio text NOT NULL,
    "fechaRegistro" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contrato" (
    id text NOT NULL,
    "unidadId" text NOT NULL,
    "archivoNombre" text NOT NULL,
    "fechaFirma" timestamp(3) without time zone NOT NULL,
    "quienFirmo" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Desarrollador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Desarrollador" (
    id text NOT NULL,
    nombre text NOT NULL,
    contacto text,
    "condicionesComerciales" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Evento" (
    id text NOT NULL,
    "entidadTipo" text NOT NULL,
    "entidadId" text NOT NULL,
    tipo text NOT NULL,
    "estadoAnterior" text,
    "estadoNuevo" text,
    comentario text,
    usuario text DEFAULT 'sistema'::text NOT NULL,
    fecha timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Exhibicion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Exhibicion" (
    id text NOT NULL,
    "planId" text NOT NULL,
    numero integer NOT NULL,
    "fechaProgramada" timestamp(3) without time zone NOT NULL,
    monto numeric(12,2) NOT NULL,
    estado public."EstadoExhibicion" DEFAULT 'PENDIENTE'::public."EstadoExhibicion" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Pago" (
    id text NOT NULL,
    "planId" text NOT NULL,
    "exhibicionId" text NOT NULL,
    monto numeric(12,2) NOT NULL,
    fecha timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "referenciaStripe" text,
    "porcentajeComision" numeric(5,4) NOT NULL,
    "montoComision" numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Paquete; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Paquete" (
    id text NOT NULL,
    nivel integer NOT NULL,
    nombre text NOT NULL,
    partidas text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    descripcion text,
    imagen text,
    "esArmable" boolean DEFAULT false NOT NULL,
    slug text NOT NULL
);


--
-- Name: Partida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Partida" (
    id text NOT NULL,
    clave text NOT NULL,
    nombre text NOT NULL,
    familia public."FamiliaPartida" NOT NULL,
    armable boolean DEFAULT true NOT NULL,
    "porDefecto" boolean DEFAULT false NOT NULL,
    "porEquipo" boolean DEFAULT false NOT NULL,
    "llevaPlano" boolean DEFAULT false NOT NULL,
    imagen text,
    ficha jsonb NOT NULL,
    acabados jsonb,
    orden integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Plan" (
    id text NOT NULL,
    "compradorId" text NOT NULL,
    "paqueteId" text NOT NULL,
    "precioId" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "fechaCongelamiento" timestamp(3) without time zone,
    "montoCongelado" numeric(12,2) NOT NULL,
    saldo numeric(12,2) NOT NULL,
    estado public."EstadoPlan" DEFAULT 'COTIZADO'::public."EstadoPlan" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Precio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Precio" (
    id text NOT NULL,
    "prototipoId" text NOT NULL,
    "paqueteId" text NOT NULL,
    monto numeric(12,2) NOT NULL,
    "vigenteDesde" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "vigenteHasta" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PrecioPartida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PrecioPartida" (
    id text NOT NULL,
    "prototipoId" text NOT NULL,
    "partidaId" text NOT NULL,
    monto numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Prototipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Prototipo" (
    id text NOT NULL,
    "proyectoId" text NOT NULL,
    clave text NOT NULL,
    superficie numeric(8,2) NOT NULL,
    recamaras integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "climasDefault" integer DEFAULT 1 NOT NULL
);


--
-- Name: Proyecto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Proyecto" (
    id text NOT NULL,
    "desarrolladorId" text NOT NULL,
    nombre text NOT NULL,
    "etapaPipeline" text DEFAULT 'Vendiendo'::text NOT NULL,
    "numeroUnidades" integer NOT NULL,
    "porcentajeAnticipo" numeric(5,4) DEFAULT 0.30 NOT NULL,
    "porcentajeComision" numeric(5,4) NOT NULL,
    "fechaEntregaUnidades" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    imagen text
);


--
-- Name: Unidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Unidad" (
    id text NOT NULL,
    "proyectoId" text NOT NULL,
    torre text NOT NULL,
    numero text NOT NULL,
    "prototipoId" text NOT NULL,
    "estadoFinanciero" public."EstadoFinanciero" DEFAULT 'COTIZADO'::public."EstadoFinanciero" NOT NULL,
    "estadoOperativo" public."EstadoOperativo" DEFAULT 'PENDIENTE'::public."EstadoOperativo" NOT NULL,
    "estadoInstalacion" public."EstadoInstalacion" DEFAULT 'NO_PROGRAMADA'::public."EstadoInstalacion" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: _PaqueteToPartida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."_PaqueteToPartida" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: Comprador; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Comprador" (id, nombre, contacto, "unidadId", folio, "fechaRegistro") FROM stdin;
cmuhnhnpv006mi7wytxnbxsr2	Lucía Menchaca	81 8100 4412	cmuhnhnov003ni7wy034kxab9	DU-001	2026-09-26 00:27:40.244
\.


--
-- Data for Name: Contrato; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Contrato" (id, "unidadId", "archivoNombre", "fechaFirma", "quienFirmo", "createdAt") FROM stdin;
cmuhnhnqj0074i7wyao16s3k2	cmuhnhnov003ni7wy034kxab9	contrato-BR717-menchaca.pdf	2026-09-10 18:00:00	Lucía Menchaca	2026-09-26 00:27:40.267
\.


--
-- Data for Name: Desarrollador; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Desarrollador" (id, nombre, contacto, "condicionesComerciales", "createdAt") FROM stdin;
cmuhnhnmr0000i7wylcym7glw	PISSA	obra@pissa.example	Comisión del canal 15 %. Anticipo 30 %.	2026-09-26 00:27:40.132
\.


--
-- Data for Name: Evento; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Evento" (id, "entidadTipo", "entidadId", tipo, "estadoAnterior", "estadoNuevo", comentario, usuario, fecha) FROM stdin;
cmuhnhnqf0072i7wya1nvnpgv	plan	cmuhnhnq8006oi7wy9ls7mtgj	plan_cotizado	\N	COTIZADO	Cotización por $176200.00. El precio se congela cuando se cobre el anticipo.	sistema	2026-09-26 00:27:40.263
cmuhnhns30075i7wyxgdav747	unidad	cmuhnhnov003ni7wy034kxab9	contrato_registrado	\N	\N	Contrato firmado por Lucía Menchaca el 10/9/2026.	sistema	2026-09-26 00:27:40.323
cmuhnhnsh0078i7wyhk9o3bmk	plan	cmuhnhnq8006oi7wy9ls7mtgj	anticipo_cobrado	COTIZADO	APARTADO	Anticipo de $52860.00 cobrado. Precio congelado en $176200.00. Comisión del canal: $7929.00.	sistema	2026-09-26 00:27:40.337
cmuhnhnsn007bi7wydly9nvt1	plan	cmuhnhnq8006oi7wy9ls7mtgj	exhibicion_cobrada	\N	AL_CORRIENTE	Exhibición 1 de $10278.00 cobrada. Comisión del canal: $1541.70.	sistema	2026-09-26 00:27:40.344
cmuhnhnst007ei7wy6b9mg6fe	plan	cmuhnhnq8006oi7wy9ls7mtgj	exhibicion_cobrada	\N	AL_CORRIENTE	Exhibición 2 de $10278.00 cobrada. Comisión del canal: $1541.70.	sistema	2026-09-26 00:27:40.349
\.


--
-- Data for Name: Exhibicion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Exhibicion" (id, "planId", numero, "fechaProgramada", monto, estado, "createdAt") FROM stdin;
cmuhnhnq8006si7wy4a5rx2vu	cmuhnhnq8006oi7wy9ls7mtgj	3	2026-12-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006ti7wy3l4xzw52	cmuhnhnq8006oi7wy9ls7mtgj	4	2027-01-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006ui7wy24agqn56	cmuhnhnq8006oi7wy9ls7mtgj	5	2027-02-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006vi7wyz4zaw0tt	cmuhnhnq8006oi7wy9ls7mtgj	6	2027-03-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006wi7wy4fkxb3lg	cmuhnhnq8006oi7wy9ls7mtgj	7	2027-04-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006xi7wylmafwfuu	cmuhnhnq8006oi7wy9ls7mtgj	8	2027-05-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006yi7wydnypdzm9	cmuhnhnq8006oi7wy9ls7mtgj	9	2027-06-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006zi7wygajbw2k5	cmuhnhnq8006oi7wy9ls7mtgj	10	2027-07-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq80070i7wy49g2rzl8	cmuhnhnq8006oi7wy9ls7mtgj	11	2027-08-26 00:27:40.25	10278.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq80071i7wyqu5bv5ws	cmuhnhnq8006oi7wy9ls7mtgj	12	2027-09-26 00:27:40.25	10282.00	PENDIENTE	2026-09-26 00:27:40.256
cmuhnhnq8006pi7wydrlkyrad	cmuhnhnq8006oi7wy9ls7mtgj	0	2026-09-26 00:27:40.25	52860.00	PAGADA	2026-09-26 00:27:40.256
cmuhnhnq8006qi7wyg7x1c0o9	cmuhnhnq8006oi7wy9ls7mtgj	1	2026-10-26 00:27:40.25	10278.00	PAGADA	2026-09-26 00:27:40.256
cmuhnhnq8006ri7wyt9gf9zl4	cmuhnhnq8006oi7wy9ls7mtgj	2	2026-11-26 00:27:40.25	10278.00	PAGADA	2026-09-26 00:27:40.256
\.


--
-- Data for Name: Pago; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Pago" (id, "planId", "exhibicionId", monto, fecha, "referenciaStripe", "porcentajeComision", "montoComision", "createdAt") FROM stdin;
cmuhnhnsc0077i7wysm50x7kh	cmuhnhnq8006oi7wy9ls7mtgj	cmuhnhnq8006pi7wydrlkyrad	52860.00	2026-09-26 00:27:40.331	\N	0.1500	7929.00	2026-09-26 00:27:40.333
cmuhnhnsl007ai7wyad078dew	cmuhnhnq8006oi7wy9ls7mtgj	cmuhnhnq8006qi7wyg7x1c0o9	10278.00	2026-09-26 00:27:40.342	\N	0.1500	1541.70	2026-09-26 00:27:40.342
cmuhnhnsr007di7wyjnfbqknq	cmuhnhnq8006oi7wy9ls7mtgj	cmuhnhnq8006ri7wyt9gf9zl4	10278.00	2026-09-26 00:27:40.348	\N	0.1500	1541.70	2026-09-26 00:27:40.348
\.


--
-- Data for Name: Paquete; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Paquete" (id, nivel, nombre, partidas, "createdAt", descripcion, imagen, "esArmable", slug) FROM stdin;
cmuhnhnn7000ci7wyre19psut	1	Casa Lista	{"Cocina integral sobre diseño","Clósets de recámaras","Carpintería complementaria"}	2026-09-26 00:27:40.148	Lo indispensable para habitar	/paquetes/casa-lista.jpg	f	casa-lista
cmuhnhnnf000di7wy1xsdm2kj	2	Confort	{"Clima minisplit inverter en sala y en cada recámara"}	2026-09-26 00:27:40.155	Todo lo anterior, más el clima	/paquetes/confort.jpg	f	confort
cmuhnhnni000ei7wyu5x7dohd	3	Plus	{"Muro decorativo en sala","Cuarto de lavado equipado"}	2026-09-26 00:27:40.158	Todo lo anterior, más los remates	/paquetes/plus.jpg	f	plus
cmuhnhnnl000fi7wyrox8e0sf	4	Total	{"Pantalla de gran formato",Refrigerador,Lavadora,Estufa,"Vale de muebles para estrenar"}	2026-09-26 00:27:40.161	Listo para mudarte el mismo día	/paquetes/total.jpg	f	total
cmuhnhnnn000gi7wyk5ccfdt2	5	Arma el tuyo	{"Los climas que necesite tu depa","Clósets, carpintería, lavado","Muro, pantalla, electrodomésticos, vale","Marca solo lo que quieras, a precio de lista"}	2026-09-26 00:27:40.164	Sin cocina. Tú escoges lo demás	/paquetes/arma-el-tuyo.jpg	t	arma-el-tuyo
\.


--
-- Data for Name: Partida; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Partida" (id, clave, nombre, familia, armable, "porDefecto", "porEquipo", "llevaPlano", imagen, ficha, acabados, orden, "createdAt") FROM stdin;
cmuhnhnmx0001i7wydrevjkk8	cocina	Cocina integral sobre diseño	A_LA_MEDIDA	f	f	f	t	/productos/cocina.jpg	[["Frente", "Según levantamiento en obra (3.6 ml en el DEPA 2R)"], ["Cubierta", "— Moretti"], ["Puertas y cajones", "— Moretti"], ["Herrajes", "— Moretti"], ["Tarja y mezcladora", "— Moretti"], ["Garantía", "— Moretti"]]	[["Opción 1 · Roble claro", "#C9A97C"], ["Opción 2 · Nogal", "#6B4A2B"], ["Opción 3 · Blanco mate", "#EDEAE3"]]	0	2026-09-26 00:27:40.137
cmuhnhnn00002i7wyw5nzy11d	closets	Clósets de recámaras	A_LA_MEDIDA	t	t	f	f	\N	[["Metros lineales", "Según levantamiento (5.2 ml en el DEPA 2R)"], ["Interiores", "— Moretti"], ["Puertas", "— Moretti"], ["Garantía", "— Moretti"]]	[["Opción 1 · Roble claro", "#C9A97C"], ["Opción 2 · Nogal", "#6B4A2B"], ["Opción 3 · Blanco mate", "#EDEAE3"]]	1	2026-09-26 00:27:40.14
cmuhnhnn10003i7wyh0szqid3	carp	Carpintería complementaria	A_LA_MEDIDA	t	t	f	f	\N	[["Alcance", "Marcos, zoclos y remates interiores"], ["Material", "— Moretti"], ["Garantía", "— Moretti"]]	[["Opción 1 · Roble claro", "#C9A97C"], ["Opción 2 · Nogal", "#6B4A2B"], ["Opción 3 · Blanco mate", "#EDEAE3"]]	2	2026-09-26 00:27:40.141
cmuhnhnn20004i7wyhazyd604	clima	Clima minisplit	DE_CATALOGO	t	f	t	f	/productos/clima.jpg	[["Capacidad", "1 tonelada"], ["Voltaje", "220 V"], ["Tecnología", "Inverter, frío / calor"], ["Cuántos", "Uno por espacio: sala y cada recámara"], ["Conexión eléctrica", "— Moretti: quién deja la preparación"], ["Marca y modelo", "— Moretti"], ["Garantía", "— Moretti"]]	\N	3	2026-09-26 00:27:40.142
cmuhnhnn20005i7wyacnl00ro	lavado	Cuarto de lavado equipado	A_LA_MEDIDA	t	f	f	f	\N	[["Alcance", "Mueble, cubierta y preparación para lavadora"], ["Material", "— Moretti"], ["Garantía", "— Moretti"]]	[["Opción 1 · Roble claro", "#C9A97C"], ["Opción 2 · Blanco mate", "#EDEAE3"]]	4	2026-09-26 00:27:40.143
cmuhnhnn30006i7wycprx5b58	panel	Muro decorativo en sala	DE_CATALOGO	t	f	f	f	/productos/panel.jpg	[["Pieza", "122 × 290 cm"], ["Rendimiento", "2.87 m² por pieza, con merma"], ["Cuántas piezas", "Según el muro de tu sala (14 en el DEPA 2R)"], ["Presentación", "— Moretti: piezas por caja"], ["Instalación", "Incluida"], ["Garantía", "— Moretti"]]	[["Opción 1 · Piedra clara", "#D9D2C7"], ["Opción 2 · Piedra gris", "#8A8680"], ["Opción 3 · Concreto", "#A9A39A"]]	5	2026-09-26 00:27:40.144
cmuhnhnn40007i7wyg9sdhp3j	tv	Pantalla de gran formato	DE_CATALOGO	t	f	f	f	/productos/tv.jpg	[["Tamaño", "98 pulgadas"], ["Clave", "SMART1004K"], ["Marca y modelo", "— Moretti"], ["Conexión", "— Moretti"], ["Garantía", "La del fabricante"]]	\N	6	2026-09-26 00:27:40.144
cmuhnhnn50008i7wy48upxy2r	estufa	Estufa	DE_CATALOGO	t	f	f	f	\N	[["Clave", "ELECGRILL"], ["Alimentación", "Eléctrica — voltaje: — Moretti"], ["Marca y modelo", "— Moretti"], ["Garantía", "La del fabricante"]]	\N	7	2026-09-26 00:27:40.145
cmuhnhnn50009i7wy8l4nsujq	refri	Refrigerador	DE_CATALOGO	t	f	f	f	\N	[["Capacidad", "— Moretti"], ["Marca y modelo", "— Moretti"], ["Garantía", "La del fabricante"]]	\N	8	2026-09-26 00:27:40.146
cmuhnhnn6000ai7wyasquv1z8	lava	Lavadora	DE_CATALOGO	t	f	f	f	\N	[["Capacidad", "— Moretti"], ["Marca y modelo", "— Moretti"], ["Garantía", "La del fabricante"]]	\N	9	2026-09-26 00:27:40.146
cmuhnhnn6000bi7wyehoa90on	vale	Vale de muebles para estrenar	VALE	t	f	f	f	\N	[["Monto", "Entre $50,000 y $70,000"], ["Dónde se canjea", "— Moretti: tienda"], ["Vigencia", "— Moretti"]]	\N	10	2026-09-26 00:27:40.147
\.


--
-- Data for Name: Plan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Plan" (id, "compradorId", "paqueteId", "precioId", version, "fechaCongelamiento", "montoCongelado", saldo, estado, "createdAt") FROM stdin;
cmuhnhnq8006oi7wy9ls7mtgj	cmuhnhnpv006mi7wytxnbxsr2	cmuhnhnnf000di7wy1xsdm2kj	cmuhnhnnw000mi7wyiabhxh26	1	2026-09-26 00:27:40.331	176200.00	102784.00	ACTIVO	2026-09-26 00:27:40.256
\.


--
-- Data for Name: Precio; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Precio" (id, "prototipoId", "paqueteId", monto, "vigenteDesde", "vigenteHasta", "createdAt") FROM stdin;
cmuhnhnnw000li7wyvl3qkmk9	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn7000ci7wyre19psut	147300.00	2026-09-26 00:27:40.173	\N	2026-09-26 00:27:40.173
cmuhnhnnw000mi7wyiabhxh26	cmuhnhnnu000ki7wy99jnexci	cmuhnhnnf000di7wy1xsdm2kj	176200.00	2026-09-26 00:27:40.173	\N	2026-09-26 00:27:40.173
cmuhnhnnw000ni7wy9chsxg8u	cmuhnhnnu000ki7wy99jnexci	cmuhnhnni000ei7wyu5x7dohd	195600.00	2026-09-26 00:27:40.173	\N	2026-09-26 00:27:40.173
cmuhnhnnw000oi7wyvd9tkiqt	cmuhnhnnu000ki7wy99jnexci	cmuhnhnnl000fi7wyrox8e0sf	375800.00	2026-09-26 00:27:40.173	\N	2026-09-26 00:27:40.173
cmuhnhno40011i7wyxjyfw7eu	cmuhnhno30010i7wy5sib21yi	cmuhnhnn7000ci7wyre19psut	145700.00	2026-09-26 00:27:40.181	\N	2026-09-26 00:27:40.181
cmuhnhno40012i7wyyp542lnr	cmuhnhno30010i7wy5sib21yi	cmuhnhnnf000di7wy1xsdm2kj	174700.00	2026-09-26 00:27:40.181	\N	2026-09-26 00:27:40.181
cmuhnhno40013i7wyaqu5ao40	cmuhnhno30010i7wy5sib21yi	cmuhnhnni000ei7wyu5x7dohd	192400.00	2026-09-26 00:27:40.181	\N	2026-09-26 00:27:40.181
cmuhnhno40014i7wyo6v1xygo	cmuhnhno30010i7wy5sib21yi	cmuhnhnnl000fi7wyrox8e0sf	372500.00	2026-09-26 00:27:40.181	\N	2026-09-26 00:27:40.181
cmuhnhno8001hi7wykczertf4	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn7000ci7wyre19psut	212700.00	2026-09-26 00:27:40.184	\N	2026-09-26 00:27:40.184
cmuhnhno8001ii7wygz97zu6x	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnnf000di7wy1xsdm2kj	251300.00	2026-09-26 00:27:40.184	\N	2026-09-26 00:27:40.184
cmuhnhno8001ji7wylcc4b2h4	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnni000ei7wyu5x7dohd	270700.00	2026-09-26 00:27:40.184	\N	2026-09-26 00:27:40.184
cmuhnhno8001ki7wyeglwe2b6	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnnl000fi7wyrox8e0sf	450800.00	2026-09-26 00:27:40.184	\N	2026-09-26 00:27:40.184
cmuhnhnoc001xi7wyp0jlhozs	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn7000ci7wyre19psut	169500.00	2026-09-26 00:27:40.189	\N	2026-09-26 00:27:40.189
cmuhnhnoc001yi7wy0jqa9l9y	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnnf000di7wy1xsdm2kj	208000.00	2026-09-26 00:27:40.189	\N	2026-09-26 00:27:40.189
cmuhnhnoc001zi7wyhmlw3bok	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnni000ei7wyu5x7dohd	225700.00	2026-09-26 00:27:40.189	\N	2026-09-26 00:27:40.189
cmuhnhnoc0020i7wyur9rhxeb	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnnl000fi7wyrox8e0sf	405900.00	2026-09-26 00:27:40.189	\N	2026-09-26 00:27:40.189
cmuhnhnoh002di7wyx03o564z	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn7000ci7wyre19psut	213600.00	2026-09-26 00:27:40.194	\N	2026-09-26 00:27:40.194
cmuhnhnoh002ei7wy580to859	cmuhnhnog002ci7wyoult0vmu	cmuhnhnnf000di7wy1xsdm2kj	242500.00	2026-09-26 00:27:40.194	\N	2026-09-26 00:27:40.194
cmuhnhnoh002fi7wy1yjub8vg	cmuhnhnog002ci7wyoult0vmu	cmuhnhnni000ei7wyu5x7dohd	261900.00	2026-09-26 00:27:40.194	\N	2026-09-26 00:27:40.194
cmuhnhnoh002gi7wyum57fgaz	cmuhnhnog002ci7wyoult0vmu	cmuhnhnnl000fi7wyrox8e0sf	442000.00	2026-09-26 00:27:40.194	\N	2026-09-26 00:27:40.194
cmuhnhnom002ti7wyi08yp7v4	cmuhnhnol002si7wyi0ov972o	cmuhnhnn7000ci7wyre19psut	186200.00	2026-09-26 00:27:40.199	\N	2026-09-26 00:27:40.199
cmuhnhnom002ui7wysd1dz0tj	cmuhnhnol002si7wyi0ov972o	cmuhnhnnf000di7wy1xsdm2kj	215100.00	2026-09-26 00:27:40.199	\N	2026-09-26 00:27:40.199
cmuhnhnom002vi7wy8tazp3uk	cmuhnhnol002si7wyi0ov972o	cmuhnhnni000ei7wyu5x7dohd	234500.00	2026-09-26 00:27:40.199	\N	2026-09-26 00:27:40.199
cmuhnhnom002wi7wy7l5xo386	cmuhnhnol002si7wyi0ov972o	cmuhnhnnl000fi7wyrox8e0sf	414700.00	2026-09-26 00:27:40.199	\N	2026-09-26 00:27:40.199
cmuhnhnor0039i7wypi5b8sm7	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn7000ci7wyre19psut	209200.00	2026-09-26 00:27:40.203	\N	2026-09-26 00:27:40.203
cmuhnhnor003ai7wyy9tvqok9	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnnf000di7wy1xsdm2kj	247800.00	2026-09-26 00:27:40.203	\N	2026-09-26 00:27:40.203
cmuhnhnor003bi7wyfmdn3dg9	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnni000ei7wyu5x7dohd	267200.00	2026-09-26 00:27:40.203	\N	2026-09-26 00:27:40.203
cmuhnhnor003ci7wy3k3lo3ig	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnnl000fi7wyrox8e0sf	447300.00	2026-09-26 00:27:40.203	\N	2026-09-26 00:27:40.203
cmuhnhnp3003wi7wyqo3hxdme	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn7000ci7wyre19psut	178300.00	2026-09-26 00:27:40.215	\N	2026-09-26 00:27:40.215
cmuhnhnp3003xi7wynioje7nd	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnnf000di7wy1xsdm2kj	207200.00	2026-09-26 00:27:40.215	\N	2026-09-26 00:27:40.215
cmuhnhnp3003yi7wy1ffv09r9	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnni000ei7wyu5x7dohd	224900.00	2026-09-26 00:27:40.215	\N	2026-09-26 00:27:40.215
cmuhnhnp3003zi7wyuhqlxuz4	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnnl000fi7wyrox8e0sf	405100.00	2026-09-26 00:27:40.215	\N	2026-09-26 00:27:40.215
cmuhnhnp7004ci7wy31c553a7	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn7000ci7wyre19psut	98900.00	2026-09-26 00:27:40.22	\N	2026-09-26 00:27:40.22
cmuhnhnp7004di7wy5cngetqp	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnnf000di7wy1xsdm2kj	127800.00	2026-09-26 00:27:40.22	\N	2026-09-26 00:27:40.22
cmuhnhnp7004ei7wy6fbyzvaq	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnni000ei7wyu5x7dohd	145500.00	2026-09-26 00:27:40.22	\N	2026-09-26 00:27:40.22
cmuhnhnp7004fi7wygltp7rd0	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnnl000fi7wyrox8e0sf	325600.00	2026-09-26 00:27:40.22	\N	2026-09-26 00:27:40.22
cmuhnhnpb004si7wy2933cd82	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn7000ci7wyre19psut	136500.00	2026-09-26 00:27:40.224	\N	2026-09-26 00:27:40.224
cmuhnhnpb004ti7wye6iv8ji6	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnnf000di7wy1xsdm2kj	165400.00	2026-09-26 00:27:40.224	\N	2026-09-26 00:27:40.224
cmuhnhnpb004ui7wyatstkpsw	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnni000ei7wyu5x7dohd	183100.00	2026-09-26 00:27:40.224	\N	2026-09-26 00:27:40.224
cmuhnhnpb004vi7wyfe8drite	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnnl000fi7wyrox8e0sf	363200.00	2026-09-26 00:27:40.224	\N	2026-09-26 00:27:40.224
cmuhnhnpf0058i7wyg7d8np8h	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn7000ci7wyre19psut	76200.00	2026-09-26 00:27:40.227	\N	2026-09-26 00:27:40.227
cmuhnhnpf0059i7wy1hu7wh0o	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnnf000di7wy1xsdm2kj	85800.00	2026-09-26 00:27:40.227	\N	2026-09-26 00:27:40.227
cmuhnhnpf005ai7wyyhlwh9h3	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnni000ei7wyu5x7dohd	101900.00	2026-09-26 00:27:40.227	\N	2026-09-26 00:27:40.227
cmuhnhnpf005bi7wyh83eo8zh	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnnl000fi7wyrox8e0sf	282000.00	2026-09-26 00:27:40.227	\N	2026-09-26 00:27:40.227
cmuhnhnpi005oi7wyaqn1vkss	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn7000ci7wyre19psut	77500.00	2026-09-26 00:27:40.231	\N	2026-09-26 00:27:40.231
cmuhnhnpi005pi7wy8b1zaqfv	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnnf000di7wy1xsdm2kj	87200.00	2026-09-26 00:27:40.231	\N	2026-09-26 00:27:40.231
cmuhnhnpi005qi7wyzesmguow	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnni000ei7wyu5x7dohd	103200.00	2026-09-26 00:27:40.231	\N	2026-09-26 00:27:40.231
cmuhnhnpi005ri7wyi810rqw2	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnnl000fi7wyrox8e0sf	283300.00	2026-09-26 00:27:40.231	\N	2026-09-26 00:27:40.231
cmuhnhnpn0064i7wyv6onofkp	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn7000ci7wyre19psut	91600.00	2026-09-26 00:27:40.235	\N	2026-09-26 00:27:40.235
cmuhnhnpn0065i7wyehpirbic	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnnf000di7wy1xsdm2kj	110900.00	2026-09-26 00:27:40.235	\N	2026-09-26 00:27:40.235
cmuhnhnpn0066i7wyv39a7vla	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnni000ei7wyu5x7dohd	126900.00	2026-09-26 00:27:40.235	\N	2026-09-26 00:27:40.235
cmuhnhnpn0067i7wycveasbqw	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnnl000fi7wyrox8e0sf	307100.00	2026-09-26 00:27:40.235	\N	2026-09-26 00:27:40.235
\.


--
-- Data for Name: PrecioPartida; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PrecioPartida" (id, "prototipoId", "partidaId", monto, "createdAt") FROM stdin;
cmuhnhnnz000pi7wyup4ztypp	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn00002i7wyw5nzy11d	54600.00	2026-09-26 00:27:40.176
cmuhnhno0000qi7wyg9h7m921	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn10003i7wyh0szqid3	14700.00	2026-09-26 00:27:40.176
cmuhnhno0000ri7wym72jdd1n	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.176
cmuhnhno0000si7wy9gerfln6	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn30006i7wycprx5b58	8500.00	2026-09-26 00:27:40.176
cmuhnhno0000ti7wym4ay2lgs	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.176
cmuhnhno0000ui7wy0q93r3ml	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.176
cmuhnhno0000vi7wyfl309zg6	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.176
cmuhnhno0000wi7wy5xy6bybz	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.176
cmuhnhno0000xi7wy81d68f42	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.176
cmuhnhno0000yi7wyykdm0fbf	cmuhnhnnu000ki7wy99jnexci	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.176
cmuhnhno60015i7wydffz6o7l	cmuhnhno30010i7wy5sib21yi	cmuhnhnn00002i7wyw5nzy11d	52500.00	2026-09-26 00:27:40.182
cmuhnhno60016i7wy7j4iw9ns	cmuhnhno30010i7wy5sib21yi	cmuhnhnn10003i7wyh0szqid3	15200.00	2026-09-26 00:27:40.182
cmuhnhno60017i7wy87wj5vum	cmuhnhno30010i7wy5sib21yi	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.182
cmuhnhno60018i7wy8idg2ubz	cmuhnhno30010i7wy5sib21yi	cmuhnhnn30006i7wycprx5b58	6800.00	2026-09-26 00:27:40.182
cmuhnhno60019i7wy4x9249ry	cmuhnhno30010i7wy5sib21yi	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.182
cmuhnhno6001ai7wyefz1k0vy	cmuhnhno30010i7wy5sib21yi	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.182
cmuhnhno6001bi7wyaf226vpd	cmuhnhno30010i7wy5sib21yi	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.182
cmuhnhno6001ci7wyi4bktt5b	cmuhnhno30010i7wy5sib21yi	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.182
cmuhnhno6001di7wylxlc3txe	cmuhnhno30010i7wy5sib21yi	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.182
cmuhnhno6001ei7wyfkua0nv3	cmuhnhno30010i7wy5sib21yi	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.182
cmuhnhno9001li7wy1jm40st6	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn00002i7wyw5nzy11d	67100.00	2026-09-26 00:27:40.186
cmuhnhno9001mi7wyx3cdt9d8	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn10003i7wyh0szqid3	19800.00	2026-09-26 00:27:40.186
cmuhnhno9001ni7wyc8mtb27m	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.186
cmuhnhno9001oi7wy869kkw9m	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn30006i7wycprx5b58	8500.00	2026-09-26 00:27:40.186
cmuhnhno9001pi7wyh26e0exv	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.186
cmuhnhno9001qi7wymp784soe	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.186
cmuhnhno9001ri7wyf7ezp5p0	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.186
cmuhnhno9001si7wyzuqri5m7	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.186
cmuhnhno9001ti7wytryv44ox	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.186
cmuhnhno9001ui7wy8te49wms	cmuhnhno7001gi7wy15nq0o0y	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.186
cmuhnhnoe0021i7wytard1rkf	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn00002i7wyw5nzy11d	69200.00	2026-09-26 00:27:40.191
cmuhnhnoe0022i7wylseydy9q	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn10003i7wyh0szqid3	17800.00	2026-09-26 00:27:40.191
cmuhnhnoe0023i7wynixjyj61	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.191
cmuhnhnoe0024i7wydl9ms39a	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn30006i7wycprx5b58	6800.00	2026-09-26 00:27:40.191
cmuhnhnoe0025i7wypnyqc63o	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.191
cmuhnhnoe0026i7wyi5rpx2mc	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.191
cmuhnhnoe0027i7wyeprd3c0c	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.191
cmuhnhnoe0028i7wyn5wr3z7k	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.191
cmuhnhnoe0029i7wyb34zj8q9	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.191
cmuhnhnoe002ai7wyr29u7sqt	cmuhnhnob001wi7wyskc0dn2n	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.191
cmuhnhnoj002hi7wyaktkyhy8	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn00002i7wyw5nzy11d	72400.00	2026-09-26 00:27:40.195
cmuhnhnoj002ii7wy7xxgfmfc	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn10003i7wyh0szqid3	24100.00	2026-09-26 00:27:40.195
cmuhnhnoj002ji7wyl9oxatbe	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.195
cmuhnhnoj002ki7wyopwdy8hv	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn30006i7wycprx5b58	8500.00	2026-09-26 00:27:40.195
cmuhnhnoj002li7wy71h0kne0	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.195
cmuhnhnoj002mi7wyzgzowpj5	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.195
cmuhnhnoj002ni7wyswjefohz	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.195
cmuhnhnoj002oi7wyl3k7knlr	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.195
cmuhnhnoj002pi7wyuk4dtzf3	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.195
cmuhnhnoj002qi7wyxeujgq61	cmuhnhnog002ci7wyoult0vmu	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.195
cmuhnhnoo002xi7wyfpmxdlu6	cmuhnhnol002si7wyi0ov972o	cmuhnhnn00002i7wyw5nzy11d	66100.00	2026-09-26 00:27:40.2
cmuhnhnoo002yi7wy4vl1chn2	cmuhnhnol002si7wyi0ov972o	cmuhnhnn10003i7wyh0szqid3	16000.00	2026-09-26 00:27:40.2
cmuhnhnoo002zi7wyimiwicrf	cmuhnhnol002si7wyi0ov972o	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.2
cmuhnhnoo0030i7wy80gpllwj	cmuhnhnol002si7wyi0ov972o	cmuhnhnn30006i7wycprx5b58	8500.00	2026-09-26 00:27:40.2
cmuhnhnoo0031i7wy8rs15ohq	cmuhnhnol002si7wyi0ov972o	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.2
cmuhnhnoo0032i7wym8ee917f	cmuhnhnol002si7wyi0ov972o	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.2
cmuhnhnoo0033i7wyop42dmjl	cmuhnhnol002si7wyi0ov972o	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.2
cmuhnhnoo0034i7wy3s9dun84	cmuhnhnol002si7wyi0ov972o	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.2
cmuhnhnoo0035i7wyo5dqak63	cmuhnhnol002si7wyi0ov972o	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.2
cmuhnhnoo0036i7wyxtyxtivi	cmuhnhnol002si7wyi0ov972o	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.2
cmuhnhnos003di7wyoym85rda	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn00002i7wyw5nzy11d	78700.00	2026-09-26 00:27:40.205
cmuhnhnos003ei7wyfs1thfm0	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn10003i7wyh0szqid3	22100.00	2026-09-26 00:27:40.205
cmuhnhnos003fi7wyly2fwg0i	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.205
cmuhnhnot003gi7wy1pjhm63h	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn30006i7wycprx5b58	8500.00	2026-09-26 00:27:40.205
cmuhnhnot003hi7wy7cu31i6o	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.205
cmuhnhnot003ii7wyq5xawzc3	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.205
cmuhnhnot003ji7wyz3g4dkr8	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.205
cmuhnhnot003ki7wyolebfv44	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.205
cmuhnhnot003li7wykl0kvsfw	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.205
cmuhnhnot003mi7wyrcdmmouy	cmuhnhnoq0038i7wyt60sb2al	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.205
cmuhnhnp40040i7wyoklqbtpr	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn00002i7wyw5nzy11d	37800.00	2026-09-26 00:27:40.217
cmuhnhnp40041i7wyce9g51kr	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn10003i7wyh0szqid3	14700.00	2026-09-26 00:27:40.217
cmuhnhnp40042i7wy4in9190m	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.217
cmuhnhnp40043i7wy1l27f3k1	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn30006i7wycprx5b58	6800.00	2026-09-26 00:27:40.217
cmuhnhnp40044i7wybd4q0djr	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.217
cmuhnhnp40045i7wyr6ry6ykh	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.217
cmuhnhnp40046i7wytlonhkxu	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.217
cmuhnhnp50047i7wyyfcscx4m	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.217
cmuhnhnp50048i7wy2nawacdf	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.217
cmuhnhnp50049i7wymo1bzbgw	cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.217
cmuhnhnp9004gi7wyjsq05kfl	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn00002i7wyw5nzy11d	33600.00	2026-09-26 00:27:40.221
cmuhnhnp9004hi7wy0zkom5t7	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn10003i7wyh0szqid3	13200.00	2026-09-26 00:27:40.221
cmuhnhnp9004ii7wyvdj2psjw	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.221
cmuhnhnp9004ji7wy8mq5owv6	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn30006i7wycprx5b58	6800.00	2026-09-26 00:27:40.221
cmuhnhnp9004ki7wyivymxx0v	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.221
cmuhnhnp9004li7wy07jza4yc	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.221
cmuhnhnp9004mi7wy1k2fs32g	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.221
cmuhnhnp9004ni7wyvfdi1wge	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.221
cmuhnhnp9004oi7wy28ewx0eo	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.221
cmuhnhnp9004pi7wyb3rszefl	cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.221
cmuhnhnpc004wi7wy7bhh9gg7	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn00002i7wyw5nzy11d	35700.00	2026-09-26 00:27:40.225
cmuhnhnpc004xi7wyqyirmost	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn10003i7wyh0szqid3	14000.00	2026-09-26 00:27:40.225
cmuhnhnpc004yi7wysxv5yzds	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.225
cmuhnhnpc004zi7wypnied8qg	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn30006i7wycprx5b58	6800.00	2026-09-26 00:27:40.225
cmuhnhnpc0050i7wyb7sbafkt	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.225
cmuhnhnpc0051i7wycsegsl7d	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.225
cmuhnhnpc0052i7wyd362jwl0	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.225
cmuhnhnpc0053i7wysogcxyn6	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.225
cmuhnhnpc0054i7wyqjoimtso	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.225
cmuhnhnpc0055i7wy2wd6rwqs	cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.225
cmuhnhnpg005ci7wy1e138424	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn00002i7wyw5nzy11d	15800.00	2026-09-26 00:27:40.228
cmuhnhnpg005di7wydemv04wy	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn10003i7wyh0szqid3	8400.00	2026-09-26 00:27:40.228
cmuhnhnpg005ei7wyftwctihh	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.228
cmuhnhnpg005fi7wy3w5afh2e	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn30006i7wycprx5b58	5100.00	2026-09-26 00:27:40.228
cmuhnhnpg005gi7wyg6pjxtoo	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.228
cmuhnhnpg005hi7wy4prhqgvk	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.228
cmuhnhnpg005ii7wysh9bv5y8	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.228
cmuhnhnpg005ji7wyft6paoa0	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.228
cmuhnhnpg005ki7wy8kc5nw2i	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.228
cmuhnhnpg005li7wy9rebsh1c	cmuhnhnpe0057i7wyrznm6f77	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.228
cmuhnhnpk005si7wy613uwwcw	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn00002i7wyw5nzy11d	15800.00	2026-09-26 00:27:40.232
cmuhnhnpk005ti7wy2pqhtrkq	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn10003i7wyh0szqid3	9700.00	2026-09-26 00:27:40.232
cmuhnhnpk005ui7wyppmgrk64	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.232
cmuhnhnpk005vi7wy4qdfteoe	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn30006i7wycprx5b58	5100.00	2026-09-26 00:27:40.232
cmuhnhnpk005wi7wyth4xb6wk	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.232
cmuhnhnpk005xi7wy50vcasm0	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.232
cmuhnhnpk005yi7wyo28va0bq	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.232
cmuhnhnpk005zi7wynw6y79yv	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.232
cmuhnhnpk0060i7wya1nvw0br	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.232
cmuhnhnpk0061i7wyndgllf7m	cmuhnhnph005ni7wyndx6jw9n	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.232
cmuhnhnpo0068i7wympubnhfq	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn00002i7wyw5nzy11d	28400.00	2026-09-26 00:27:40.237
cmuhnhnpo0069i7wy39sapk98	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn10003i7wyh0szqid3	11200.00	2026-09-26 00:27:40.237
cmuhnhnpo006ai7wy9jlf2e8j	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn20004i7wyhazyd604	9700.00	2026-09-26 00:27:40.237
cmuhnhnpo006bi7wyyy3qh4we	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn30006i7wycprx5b58	5100.00	2026-09-26 00:27:40.237
cmuhnhnpo006ci7wynsn3j23v	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn20005i7wyacnl00ro	10900.00	2026-09-26 00:27:40.237
cmuhnhnpo006di7wy7otgah49	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn40007i7wyg9sdhp3j	46500.00	2026-09-26 00:27:40.237
cmuhnhnpo006ei7wyizkq34mw	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn50008i7wy48upxy2r	25300.00	2026-09-26 00:27:40.237
cmuhnhnpo006fi7wym0nigzqm	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn50009i7wy8l4nsujq	19300.00	2026-09-26 00:27:40.237
cmuhnhnpo006gi7wyuvawcrmv	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn6000ai7wyasquv1z8	16900.00	2026-09-26 00:27:40.237
cmuhnhnpo006hi7wyc956ikai	cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnn6000bi7wyehoa90on	72300.00	2026-09-26 00:27:40.237
\.


--
-- Data for Name: Prototipo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Prototipo" (id, "proyectoId", clave, superficie, recamaras, "createdAt", "climasDefault") FROM stdin;
cmuhnhnnu000ki7wy99jnexci	cmuhnhnns000ii7wypgkle5el	DEPA 2R (tipo 717)	57.70	2	2026-09-26 00:27:40.17	3
cmuhnhno30010i7wy5sib21yi	cmuhnhnns000ii7wypgkle5el	DEPA 2R-T	60.00	2	2026-09-26 00:27:40.18	3
cmuhnhno7001gi7wy15nq0o0y	cmuhnhnns000ii7wypgkle5el	DEPA 3R-T	78.00	3	2026-09-26 00:27:40.184	4
cmuhnhnob001wi7wyskc0dn2n	cmuhnhnns000ii7wypgkle5el	DEPA FLEX	70.00	3	2026-09-26 00:27:40.188	4
cmuhnhnog002ci7wyoult0vmu	cmuhnhnns000ii7wypgkle5el	DEPA DUPLEX	95.00	2	2026-09-26 00:27:40.193	3
cmuhnhnol002si7wyi0ov972o	cmuhnhnns000ii7wypgkle5el	GARDEN VILLA	63.00	2	2026-09-26 00:27:40.198	3
cmuhnhnoq0038i7wyt60sb2al	cmuhnhnns000ii7wypgkle5el	GARDEN VILLA FLEX	87.10	3	2026-09-26 00:27:40.202	4
cmuhnhnp2003vi7wy07e2yvcw	cmuhnhnoz003ti7wyxppj8gvh	DEPA A	58.00	2	2026-09-26 00:27:40.214	3
cmuhnhnp6004bi7wyqg2esnnh	cmuhnhnoz003ti7wyxppj8gvh	DEPA B	52.00	2	2026-09-26 00:27:40.219	3
cmuhnhnpa004ri7wye6rlvuo4	cmuhnhnoz003ti7wyxppj8gvh	DEPA C	55.00	2	2026-09-26 00:27:40.223	3
cmuhnhnpe0057i7wyrznm6f77	cmuhnhnoz003ti7wyxppj8gvh	DEPA D	33.00	1	2026-09-26 00:27:40.226	1
cmuhnhnph005ni7wyndx6jw9n	cmuhnhnoz003ti7wyxppj8gvh	DEPA E	38.00	1	2026-09-26 00:27:40.23	1
cmuhnhnpm0063i7wy9fyfdj54	cmuhnhnoz003ti7wyxppj8gvh	DEPA F	44.00	1	2026-09-26 00:27:40.234	2
\.


--
-- Data for Name: Proyecto; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Proyecto" (id, "desarrolladorId", nombre, "etapaPipeline", "numeroUnidades", "porcentajeAnticipo", "porcentajeComision", "fechaEntregaUnidades", "createdAt", imagen) FROM stdin;
cmuhnhnns000ii7wypgkle5el	cmuhnhnmr0000i7wylcym7glw	Barrio Roble	Vendiendo	63	0.3000	0.1500	2028-03-15 00:00:00	2026-09-26 00:27:40.168	/interior-hero.jpg
cmuhnhnoz003ti7wyxppj8gvh	cmuhnhnmr0000i7wylcym7glw	Barrio Santa Lucía	Vendiendo	54	0.3000	0.1500	2028-03-15 00:00:00	2026-09-26 00:27:40.212	/paquetes/total.jpg
\.


--
-- Data for Name: Unidad; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Unidad" (id, "proyectoId", torre, numero, "prototipoId", "estadoFinanciero", "estadoOperativo", "estadoInstalacion", "createdAt") FROM stdin;
cmuhnhnov003oi7wyulpoyovs	cmuhnhnns000ii7wypgkle5el	BR	718	cmuhnhnnu000ki7wy99jnexci	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.208
cmuhnhnov003pi7wyzepp5j1n	cmuhnhnns000ii7wypgkle5el	BR	1204	cmuhnhno7001gi7wy15nq0o0y	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.208
cmuhnhnov003qi7wy02bgljbo	cmuhnhnns000ii7wypgkle5el	BR	1205	cmuhnhnob001wi7wyskc0dn2n	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.208
cmuhnhnov003ri7wykot5hter	cmuhnhnns000ii7wypgkle5el	BR	302	cmuhnhnol002si7wyi0ov972o	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.208
cmuhnhnpq006ii7wy3ncvloqs	cmuhnhnoz003ti7wyxppj8gvh	BSL	902	cmuhnhnp2003vi7wy07e2yvcw	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.238
cmuhnhnpq006ji7wyjr7m1yqe	cmuhnhnoz003ti7wyxppj8gvh	BSL	903	cmuhnhnpa004ri7wye6rlvuo4	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.238
cmuhnhnpq006ki7wyre1lrme8	cmuhnhnoz003ti7wyxppj8gvh	BSL	410	cmuhnhnpe0057i7wyrznm6f77	COTIZADO	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.238
cmuhnhnov003ni7wy034kxab9	cmuhnhnns000ii7wypgkle5el	BR	717	cmuhnhnnu000ki7wy99jnexci	AL_CORRIENTE	PENDIENTE	NO_PROGRAMADA	2026-09-26 00:27:40.208
\.


--
-- Data for Name: _PaqueteToPartida; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."_PaqueteToPartida" ("A", "B") FROM stdin;
cmuhnhnn7000ci7wyre19psut	cmuhnhnmx0001i7wydrevjkk8
cmuhnhnn7000ci7wyre19psut	cmuhnhnn00002i7wyw5nzy11d
cmuhnhnn7000ci7wyre19psut	cmuhnhnn10003i7wyh0szqid3
cmuhnhnnf000di7wy1xsdm2kj	cmuhnhnn20004i7wyhazyd604
cmuhnhnni000ei7wyu5x7dohd	cmuhnhnn20005i7wyacnl00ro
cmuhnhnni000ei7wyu5x7dohd	cmuhnhnn30006i7wycprx5b58
cmuhnhnnl000fi7wyrox8e0sf	cmuhnhnn40007i7wyg9sdhp3j
cmuhnhnnl000fi7wyrox8e0sf	cmuhnhnn50008i7wy48upxy2r
cmuhnhnnl000fi7wyrox8e0sf	cmuhnhnn50009i7wy8l4nsujq
cmuhnhnnl000fi7wyrox8e0sf	cmuhnhnn6000ai7wyasquv1z8
cmuhnhnnl000fi7wyrox8e0sf	cmuhnhnn6000bi7wyehoa90on
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn00002i7wyw5nzy11d
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn10003i7wyh0szqid3
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn20004i7wyhazyd604
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn20005i7wyacnl00ro
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn30006i7wycprx5b58
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn40007i7wyg9sdhp3j
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn50008i7wy48upxy2r
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn50009i7wy8l4nsujq
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn6000ai7wyasquv1z8
cmuhnhnnn000gi7wyk5ccfdt2	cmuhnhnn6000bi7wyehoa90on
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
dd3fe44c-e8d9-4f7c-bfa4-655ec09c726a	223c90f79bc59a3555bfca7d30129da6c10dd350b6a53ee9d53ae0ce0f998de9	2026-09-25 18:27:39.320187-06	20260910184956_init_dia_uno	\N	\N	2026-09-25 18:27:39.292892-06	1
ab2e82d1-3d54-4d57-99d7-b438fe697d12	11d1de7f4b6675f0186c5c360b28be22ecc4ef243768087d916990ee234c3e05	2026-09-25 18:27:39.322014-06	20260910191001_paquete_imagen	\N	\N	2026-09-25 18:27:39.320527-06	1
2dca97bf-b78d-45db-b5b0-da37aa3f5efd	221faeda4e13bb08d8fcb25c2ce927e85f770c879f99db462d858bd12800b4dd	2026-09-25 18:27:39.323421-06	20260910191703_proyecto_imagen	\N	\N	2026-09-25 18:27:39.322359-06	1
a1b30bfd-f4ff-4110-9cd2-29eac1e3fe1b	8ccefa41012eca130d6366a41a43889bc12eac97523a9b5aa71ce05a3324e1ae	2026-09-25 18:27:39.333027-06	20260925182439_catalogo_partidas	\N	\N	2026-09-25 18:27:39.323816-06	1
\.


--
-- Name: Comprador Comprador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Comprador"
    ADD CONSTRAINT "Comprador_pkey" PRIMARY KEY (id);


--
-- Name: Contrato Contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_pkey" PRIMARY KEY (id);


--
-- Name: Desarrollador Desarrollador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Desarrollador"
    ADD CONSTRAINT "Desarrollador_pkey" PRIMARY KEY (id);


--
-- Name: Evento Evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Evento"
    ADD CONSTRAINT "Evento_pkey" PRIMARY KEY (id);


--
-- Name: Exhibicion Exhibicion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Exhibicion"
    ADD CONSTRAINT "Exhibicion_pkey" PRIMARY KEY (id);


--
-- Name: Pago Pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pago"
    ADD CONSTRAINT "Pago_pkey" PRIMARY KEY (id);


--
-- Name: Paquete Paquete_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Paquete"
    ADD CONSTRAINT "Paquete_pkey" PRIMARY KEY (id);


--
-- Name: Partida Partida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Partida"
    ADD CONSTRAINT "Partida_pkey" PRIMARY KEY (id);


--
-- Name: Plan Plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plan"
    ADD CONSTRAINT "Plan_pkey" PRIMARY KEY (id);


--
-- Name: PrecioPartida PrecioPartida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PrecioPartida"
    ADD CONSTRAINT "PrecioPartida_pkey" PRIMARY KEY (id);


--
-- Name: Precio Precio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Precio"
    ADD CONSTRAINT "Precio_pkey" PRIMARY KEY (id);


--
-- Name: Prototipo Prototipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prototipo"
    ADD CONSTRAINT "Prototipo_pkey" PRIMARY KEY (id);


--
-- Name: Proyecto Proyecto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proyecto"
    ADD CONSTRAINT "Proyecto_pkey" PRIMARY KEY (id);


--
-- Name: Unidad Unidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Unidad"
    ADD CONSTRAINT "Unidad_pkey" PRIMARY KEY (id);


--
-- Name: _PaqueteToPartida _PaqueteToPartida_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_PaqueteToPartida"
    ADD CONSTRAINT "_PaqueteToPartida_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Comprador_folio_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Comprador_folio_key" ON public."Comprador" USING btree (folio);


--
-- Name: Comprador_unidadId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Comprador_unidadId_key" ON public."Comprador" USING btree ("unidadId");


--
-- Name: Contrato_unidadId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Contrato_unidadId_key" ON public."Contrato" USING btree ("unidadId");


--
-- Name: Evento_entidadTipo_entidadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Evento_entidadTipo_entidadId_idx" ON public."Evento" USING btree ("entidadTipo", "entidadId");


--
-- Name: Exhibicion_planId_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Exhibicion_planId_numero_key" ON public."Exhibicion" USING btree ("planId", numero);


--
-- Name: Pago_exhibicionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Pago_exhibicionId_key" ON public."Pago" USING btree ("exhibicionId");


--
-- Name: Paquete_nivel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Paquete_nivel_key" ON public."Paquete" USING btree (nivel);


--
-- Name: Paquete_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Paquete_slug_key" ON public."Paquete" USING btree (slug);


--
-- Name: Partida_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Partida_clave_key" ON public."Partida" USING btree (clave);


--
-- Name: PrecioPartida_prototipoId_partidaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PrecioPartida_prototipoId_partidaId_key" ON public."PrecioPartida" USING btree ("prototipoId", "partidaId");


--
-- Name: Precio_prototipoId_paqueteId_vigenteDesde_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Precio_prototipoId_paqueteId_vigenteDesde_idx" ON public."Precio" USING btree ("prototipoId", "paqueteId", "vigenteDesde");


--
-- Name: Prototipo_proyectoId_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Prototipo_proyectoId_clave_key" ON public."Prototipo" USING btree ("proyectoId", clave);


--
-- Name: Unidad_proyectoId_torre_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Unidad_proyectoId_torre_numero_key" ON public."Unidad" USING btree ("proyectoId", torre, numero);


--
-- Name: _PaqueteToPartida_B_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "_PaqueteToPartida_B_index" ON public."_PaqueteToPartida" USING btree ("B");


--
-- Name: Comprador Comprador_unidadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Comprador"
    ADD CONSTRAINT "Comprador_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES public."Unidad"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Contrato Contrato_unidadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES public."Unidad"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Exhibicion Exhibicion_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Exhibicion"
    ADD CONSTRAINT "Exhibicion_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."Plan"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Pago Pago_exhibicionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pago"
    ADD CONSTRAINT "Pago_exhibicionId_fkey" FOREIGN KEY ("exhibicionId") REFERENCES public."Exhibicion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Pago Pago_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pago"
    ADD CONSTRAINT "Pago_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."Plan"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Plan Plan_compradorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plan"
    ADD CONSTRAINT "Plan_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES public."Comprador"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Plan Plan_paqueteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plan"
    ADD CONSTRAINT "Plan_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES public."Paquete"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Plan Plan_precioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plan"
    ADD CONSTRAINT "Plan_precioId_fkey" FOREIGN KEY ("precioId") REFERENCES public."Precio"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PrecioPartida PrecioPartida_partidaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PrecioPartida"
    ADD CONSTRAINT "PrecioPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES public."Partida"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PrecioPartida PrecioPartida_prototipoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PrecioPartida"
    ADD CONSTRAINT "PrecioPartida_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES public."Prototipo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Precio Precio_paqueteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Precio"
    ADD CONSTRAINT "Precio_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES public."Paquete"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Precio Precio_prototipoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Precio"
    ADD CONSTRAINT "Precio_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES public."Prototipo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Prototipo Prototipo_proyectoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prototipo"
    ADD CONSTRAINT "Prototipo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES public."Proyecto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Proyecto Proyecto_desarrolladorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proyecto"
    ADD CONSTRAINT "Proyecto_desarrolladorId_fkey" FOREIGN KEY ("desarrolladorId") REFERENCES public."Desarrollador"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Unidad Unidad_prototipoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Unidad"
    ADD CONSTRAINT "Unidad_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES public."Prototipo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Unidad Unidad_proyectoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Unidad"
    ADD CONSTRAINT "Unidad_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES public."Proyecto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: _PaqueteToPartida _PaqueteToPartida_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_PaqueteToPartida"
    ADD CONSTRAINT "_PaqueteToPartida_A_fkey" FOREIGN KEY ("A") REFERENCES public."Paquete"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _PaqueteToPartida _PaqueteToPartida_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_PaqueteToPartida"
    ADD CONSTRAINT "_PaqueteToPartida_B_fkey" FOREIGN KEY ("B") REFERENCES public."Partida"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 99RHMpeuCkVHZkbuRNyrnbZRHr4ucdbAlDzSe3t2EVBqzmGQz7uzxMTcZlVspRp

