--
-- PostgreSQL database dump
--

\restrict BKQd9cxbKcLygd8lUp5xECEOKenT7AsTMv79lu2eVLVEeicwlacJcyzxqH9627j

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 17.7 (Debian 17.7-3.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
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
-- Name: InstitutionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InstitutionStatus" AS ENUM (
    'active',
    'trial',
    'suspended'
);


--
-- Name: TokenType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TokenType" AS ENUM (
    'one_time_login',
    'refresh',
    'password_reset'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'active',
    'invited',
    'disabled'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

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
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    type public."TokenType" NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_tokens_id_seq OWNED BY public.auth_tokens.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    institution_id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    institution_id integer NOT NULL,
    category_id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    hod_user_id bigint,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.features (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    module_id integer NOT NULL,
    min_plan_required text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: features_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.features_id_seq OWNED BY public.features.id;


--
-- Name: institution_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_modules (
    institution_id integer NOT NULL,
    module_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    configured_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    subdomain text,
    contact_email text NOT NULL,
    plan_id integer,
    status public."InstitutionStatus" DEFAULT 'active'::public."InstitutionStatus" NOT NULL,
    trial_ends_at timestamp(3) without time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: institutions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.institutions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: institutions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.institutions_id_seq OWNED BY public.institutions.id;


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    category text,
    is_core boolean DEFAULT false NOT NULL,
    is_system_module boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: modules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modules_id_seq OWNED BY public.modules.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    action_type text,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    feature_code text NOT NULL,
    permission_code text NOT NULL,
    permission_name text NOT NULL
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_features (
    plan_id integer NOT NULL,
    feature_id integer NOT NULL,
    included boolean DEFAULT true NOT NULL,
    usage_limit integer
);


--
-- Name: plan_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_modules (
    plan_id integer NOT NULL,
    module_id integer NOT NULL,
    included boolean DEFAULT true NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    price_monthly numeric(65,30),
    price_yearly numeric(65,30),
    max_students integer,
    is_public boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: role_hierarchy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_hierarchy (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    level integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: role_hierarchy_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_hierarchy_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_hierarchy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_hierarchy_id_seq OWNED BY public.role_hierarchy.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name text NOT NULL,
    institution_id integer,
    parent_id integer,
    is_system_role boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role_hierarchy_id integer,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id bigint NOT NULL,
    role_id integer NOT NULL,
    assigned_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by bigint
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    institution_id integer,
    email text NOT NULL,
    password_hash text,
    email_verified boolean DEFAULT false NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    first_name text,
    last_name text,
    avatar_url text,
    status public."UserStatus" DEFAULT 'active'::public."UserStatus" NOT NULL,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: auth_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens ALTER COLUMN id SET DEFAULT nextval('public.auth_tokens_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: features id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features ALTER COLUMN id SET DEFAULT nextval('public.features_id_seq'::regclass);


--
-- Name: institutions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions ALTER COLUMN id SET DEFAULT nextval('public.institutions_id_seq'::regclass);


--
-- Name: modules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules ALTER COLUMN id SET DEFAULT nextval('public.modules_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: role_hierarchy id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_hierarchy ALTER COLUMN id SET DEFAULT nextval('public.role_hierarchy_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
71e1a652-8c83-43bd-b5a5-84c4b78d44fe	59c72ffb233bb830ed221dbe54b824e3b20f9f00181a86e0af2b8e7fcdfce12b	2025-12-26 17:11:30.025395+00	20251218154705_init_menntr_mvp	\N	\N	2025-12-26 17:11:29.988739+00	1
7bc4044b-7e92-4874-aaf7-164972ecd773	99453e850c82817e3d6092560db66032e46b01be1935d05e5a9d54e1251c61ca	2025-12-26 17:11:30.038683+00	20251223075740_init	\N	\N	2025-12-26 17:11:30.029399+00	1
6ecbbba4-e32d-4654-a435-8889c4741d07	5fc20c2413f4f8c6fe850d9f1666e5f2062816d3cdf1c074b497ca5fbd5e4894	2025-12-26 17:11:30.060233+00	20251226092742_add_categories_departments	\N	\N	2025-12-26 17:11:30.042082+00	1
260c14ce-2b91-4785-a55f-ffc3ba470973	6a5a7385cec109e2ad8353838af17aed0ec924e2c3e23739d932c30fda3b04c5	2025-12-26 17:11:30.076449+00	20251226170506_add_role_hierarchy	\N	\N	2025-12-26 17:11:30.064143+00	1
ebd3874d-1ee0-4566-8cee-efe672ee3704	71589a6fe8b52d92b907f505eec55a173464dde1ba00448f17f00f6002abc254	2025-12-26 17:12:42.426277+00	20251226171242_dev	\N	\N	2025-12-26 17:12:42.414458+00	1
\.


--
-- Data for Name: auth_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_tokens (id, user_id, token_hash, type, expires_at, used_at, created_at) FROM stdin;
1	4	8c0ec33d5eb8c9cc00ab613d76a1b3ed3240847e49ddd7a4b0b15bf8a16a01c7	one_time_login	2025-12-26 17:36:17.854	2025-12-26 17:22:08.362	2025-12-26 17:21:17.855
2	4	1852312bdbed4b851340bdfb35386a7d5bfe6f8f988373a9d0b3e5310621cf89	one_time_login	2025-12-27 12:55:12.099	\N	2025-12-27 12:40:12.104
3	6	3cf7acee0611e1a060bf7c6d7f16c8b524df0e12684ac5d3e52b137809be6098	one_time_login	2025-12-27 17:00:13.508	2025-12-27 16:45:55.3	2025-12-27 16:45:13.51
4	6	0056ca1fe4b016d63d85cd32b9f88498978c41558a9a8a42185d74eab418ff4a	one_time_login	2025-12-29 05:12:42.251	2025-12-29 04:58:32.882	2025-12-29 04:57:42.254
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, institution_id, name, code, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.departments (id, institution_id, category_id, name, code, hod_user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: features; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.features (id, code, name, description, module_id, min_plan_required, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: institution_modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.institution_modules (institution_id, module_id, enabled, configured_at) FROM stdin;
\.


--
-- Data for Name: institutions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.institutions (id, name, code, subdomain, contact_email, plan_id, status, trial_ends_at, metadata, created_at, updated_at) FROM stdin;
5	Harvard University	HARVARD	\N	admin@harvard.edu	2	active	\N	{}	2025-12-26 17:17:20.512	2025-12-26 17:17:20.512
6	suradfdfdffdj University	suradfrejd	suraererdj	harish00411@gmail.com	1	active	\N	{}	2025-12-26 17:17:45.515	2025-12-26 17:17:45.515
7	suradfddfdffdj University	suradddfrejd	suradererdj	harish00411@gmail.com	1	active	\N	{}	2025-12-26 17:20:38.38	2025-12-26 17:20:38.38
8	PathAxiom University	PATHAXIOM	pathaxiom	admin@pathaxiom.com	1	active	\N	{}	2025-12-27 16:09:55.611	2025-12-27 16:09:55.611
9	PathAxiom1 University	PATHAXIOM1	pathaxiom1	admin1@pathaxiom.com	1	active	\N	{}	2025-12-27 16:44:06.841	2025-12-27 16:44:06.841
10	PathAxiom12 University	PATHAXIOM12	pathaxiom12	admin12@pathaxiom.com	1	active	\N	{}	2025-12-29 05:52:39.358	2025-12-29 05:52:39.358
11	PathAxiom123 University	PATHAXIOM123	pathaxiom123	admin123@pathaxiom.com	1	active	\N	{}	2025-12-29 05:54:34.583	2025-12-29 05:54:34.583
12	PathAxiom1234 University	PATHAXIOM1234	pathaxiom1234	admin1234@pathaxiom.com	1	active	\N	{}	2025-12-29 05:55:36.808	2025-12-29 05:55:36.808
\.


--
-- Data for Name: modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.modules (id, code, name, description, icon, category, is_core, is_system_module, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (id, action_type, description, created_at, feature_code, permission_code, permission_name) FROM stdin;
\.


--
-- Data for Name: plan_features; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plan_features (plan_id, feature_id, included, usage_limit) FROM stdin;
\.


--
-- Data for Name: plan_modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plan_modules (plan_id, module_id, included) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plans (id, code, name, price_monthly, price_yearly, max_students, is_public, description, created_at) FROM stdin;
1	FREE	Free Trial	\N	\N	50	t	\N	2025-12-26 17:17:20.464
2	ENTERPRISE	Enterprise	\N	\N	\N	t	\N	2025-12-26 17:17:20.505
\.


--
-- Data for Name: role_hierarchy; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_hierarchy (id, name, description, level, active, created_at, updated_at) FROM stdin;
1	Institution Admin	Top-level institution administrator	1	t	2025-12-26 17:27:34.884	2025-12-26 17:27:34.884
2	Category Admin	Manages a category (Engineering, Medical, etc.)	2	t	2025-12-26 17:27:34.884	2025-12-26 17:27:34.884
3	Department Admin	Manages a department (CSE, ECE, etc.)	3	t	2025-12-26 17:27:34.884	2025-12-26 17:27:34.884
4	Faculty	Faculty / Teaching staff	4	t	2025-12-26 17:27:34.884	2025-12-26 17:27:34.884
5	Student	Student role	5	t	2025-12-26 17:27:34.884	2025-12-26 17:27:34.884
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions (role_id, permission_id) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, name, institution_id, parent_id, is_system_role, created_at, role_hierarchy_id, updated_at) FROM stdin;
1	Super Admin	\N	\N	t	2025-12-26 17:17:20.518	\N	2025-12-26 17:17:20.518
2	Institution Admin	6	\N	f	2025-12-26 17:17:45.533	\N	2025-12-26 17:17:45.533
3	Principal	6	\N	f	2025-12-26 17:17:45.533	\N	2025-12-26 17:17:45.533
4	HOD	6	\N	f	2025-12-26 17:17:45.533	\N	2025-12-26 17:17:45.533
5	Faculty	6	\N	f	2025-12-26 17:17:45.533	\N	2025-12-26 17:17:45.533
6	Institution Admin	7	\N	f	2025-12-26 17:20:38.392	\N	2025-12-26 17:20:38.392
7	Principal	7	\N	f	2025-12-26 17:20:38.392	\N	2025-12-26 17:20:38.392
8	HOD	7	\N	f	2025-12-26 17:20:38.392	\N	2025-12-26 17:20:38.392
9	Faculty	7	\N	f	2025-12-26 17:20:38.392	\N	2025-12-26 17:20:38.392
11	Computer Science	7	2	f	2025-12-26 17:28:20.996	3	2025-12-26 17:28:20.996
12	Institution Admin	8	\N	f	2025-12-27 16:09:55.629	1	2025-12-27 16:09:55.629
13	Principal	8	\N	f	2025-12-27 16:09:55.629	2	2025-12-27 16:09:55.629
14	HOD	8	\N	f	2025-12-27 16:09:55.629	3	2025-12-27 16:09:55.629
15	Faculty	8	\N	f	2025-12-27 16:09:55.629	4	2025-12-27 16:09:55.629
16	Institution Admin	9	\N	t	2025-12-27 16:44:06.858	1	2025-12-27 16:44:06.858
17	Category Admin	9	16	f	2025-12-27 16:44:06.864	2	2025-12-27 16:44:06.864
18	Department Admin	9	17	f	2025-12-27 16:44:06.868	3	2025-12-27 16:44:06.868
19	Faculty	9	18	f	2025-12-27 16:44:06.874	4	2025-12-27 16:44:06.874
20	Student	9	\N	f	2025-12-27 16:44:06.878	5	2025-12-27 16:44:06.878
21	Institution Admin	9	\N	f	2025-12-27 16:44:17.167	\N	2025-12-27 16:44:17.167
22	Engineering	9	16	f	2025-12-27 16:47:35.562	2	2025-12-27 16:47:35.562
23	Engineering	9	16	f	2025-12-27 16:47:52.124	2	2025-12-27 16:47:52.124
24	Computer Science	9	23	f	2025-12-27 16:53:27.738	3	2025-12-27 16:53:27.738
25	Institution Admin	10	\N	t	2025-12-29 05:52:39.382	1	2025-12-29 05:52:39.382
26	Category Admin	10	25	f	2025-12-29 05:52:39.387	2	2025-12-29 05:52:39.387
27	Department Admin	10	26	f	2025-12-29 05:52:39.393	3	2025-12-29 05:52:39.393
28	Faculty	10	27	f	2025-12-29 05:52:39.396	4	2025-12-29 05:52:39.396
29	Student	10	\N	f	2025-12-29 05:52:39.401	5	2025-12-29 05:52:39.401
30	Institution Admin	11	\N	t	2025-12-29 05:54:34.597	1	2025-12-29 05:54:34.597
31	Category Admin	11	30	f	2025-12-29 05:54:34.602	2	2025-12-29 05:54:34.602
32	Department Admin	11	31	f	2025-12-29 05:54:34.609	3	2025-12-29 05:54:34.609
33	Faculty	11	32	f	2025-12-29 05:54:34.615	4	2025-12-29 05:54:34.615
34	Student	11	\N	f	2025-12-29 05:54:34.618	5	2025-12-29 05:54:34.618
35	Institution Admin	12	\N	t	2025-12-29 05:55:36.83	1	2025-12-29 05:55:36.83
36	Category Admin	12	35	f	2025-12-29 05:55:36.836	2	2025-12-29 05:55:36.836
37	Department Admin	12	36	f	2025-12-29 05:55:36.841	3	2025-12-29 05:55:36.841
38	Faculty	12	37	f	2025-12-29 05:55:36.846	4	2025-12-29 05:55:36.846
39	Student	12	\N	f	2025-12-29 05:55:36.855	5	2025-12-29 05:55:36.855
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (user_id, role_id, assigned_at, assigned_by) FROM stdin;
2	1	2025-12-26 17:17:20.602	\N
3	1	2025-12-26 17:20:09.148	3
4	6	2025-12-26 17:20:49.653	3
2	11	2025-12-26 17:28:21.001	\N
5	12	2025-12-27 16:10:23.288	3
6	21	2025-12-27 16:44:17.172	3
6	20	2025-12-27 16:45:13.497	3
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, institution_id, email, password_hash, email_verified, must_change_password, first_name, last_name, avatar_url, status, last_login_at, created_at, updated_at) FROM stdin;
2	\N	superadmin@menntr.com	$2b$10$.TdH4/nApCQuf24qpQmKPe/XkbTLzpoRr4ODZdDXcjZLVuIdLWn/2	f	f	\N	\N	\N	active	\N	2025-12-26 17:17:20.597	2025-12-26 17:17:20.597
1	\N	ravi@menntr.com	$2b$12$DyuVYpOGTKm1E9xO6woeDeGFX21WGU8uRbezEi/gzg0xdZMcz3qM2	f	f	ravi	shankar	\N	active	2025-12-26 17:17:36.218	2025-12-26 17:13:46.315	2025-12-26 17:17:36.228
4	7	harish00411@gmail.com	$2b$12$M/C.b5ZPUa7FV/G3eQxdk.g6BLCF.wwdKz2BZtfAmzmLGRZglEUo6	f	f	ashok suraj	C	\N	active	2025-12-26 17:23:33.975	2025-12-26 17:20:49.631	2025-12-26 17:23:33.977
3	\N	ravi1@menntr.com	$2b$12$Sdec1NCuyjmbBrVrs.9glOSCqIE39b7DQAHRnAd9yoRr5WbDzi.hK	f	f	ravi	shankar	\N	active	2025-12-27 16:09:39.73	2025-12-26 17:20:09.138	2025-12-27 16:09:39.737
5	8	harish00411@gmail.com	\N	f	t	ashok suraj	C	\N	active	\N	2025-12-27 16:10:23.265	2025-12-27 16:10:23.265
6	9	harish00411@gmail.com	$2b$12$x86VbGOuWfCd6Wh55H19B.Ff5UcPAJuJ1o7tvdVvlHrWtXTltLlYu	f	f	ashok suraj	C	\N	active	\N	2025-12-27 16:44:17.146	2025-12-27 16:46:16.309
\.


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_tokens_id_seq', 4, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 1, false);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 1, false);


--
-- Name: features_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.features_id_seq', 1, false);


--
-- Name: institutions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.institutions_id_seq', 12, true);


--
-- Name: modules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.modules_id_seq', 1, false);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.permissions_id_seq', 1, false);


--
-- Name: plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.plans_id_seq', 2, true);


--
-- Name: role_hierarchy_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.role_hierarchy_id_seq', 1, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 39, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 6, true);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: institution_modules institution_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_modules
    ADD CONSTRAINT institution_modules_pkey PRIMARY KEY (institution_id, module_id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (plan_id, feature_id);


--
-- Name: plan_modules plan_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_modules
    ADD CONSTRAINT plan_modules_pkey PRIMARY KEY (plan_id, module_id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: role_hierarchy role_hierarchy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_hierarchy
    ADD CONSTRAINT role_hierarchy_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: categories_institution_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_institution_id_code_key ON public.categories USING btree (institution_id, code);


--
-- Name: departments_institution_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX departments_institution_id_code_key ON public.departments USING btree (institution_id, code);


--
-- Name: departments_institution_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX departments_institution_id_idx ON public.departments USING btree (institution_id);


--
-- Name: features_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX features_code_key ON public.features USING btree (code);


--
-- Name: institutions_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX institutions_code_key ON public.institutions USING btree (code);


--
-- Name: modules_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modules_code_key ON public.modules USING btree (code);


--
-- Name: plans_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);


--
-- Name: role_hierarchy_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_hierarchy_name_key ON public.role_hierarchy USING btree (name);


--
-- Name: users_email_institution_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_institution_id_key ON public.users USING btree (email, institution_id);


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: categories categories_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: departments departments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: departments departments_hod_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_hod_user_id_fkey FOREIGN KEY (hod_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: departments departments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: features features_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: institution_modules institution_modules_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_modules
    ADD CONSTRAINT institution_modules_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: institution_modules institution_modules_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_modules
    ADD CONSTRAINT institution_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: institutions institutions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: permissions permissions_feature_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_feature_code_fkey FOREIGN KEY (feature_code) REFERENCES public.features(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: plan_features plan_features_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.features(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: plan_features plan_features_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: plan_modules plan_modules_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_modules
    ADD CONSTRAINT plan_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: plan_modules plan_modules_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_modules
    ADD CONSTRAINT plan_modules_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: roles roles_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: roles roles_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: roles roles_role_hierarchy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_hierarchy_id_fkey FOREIGN KEY (role_hierarchy_id) REFERENCES public.role_hierarchy(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict BKQd9cxbKcLygd8lUp5xECEOKenT7AsTMv79lu2eVLVEeicwlacJcyzxqH9627j

