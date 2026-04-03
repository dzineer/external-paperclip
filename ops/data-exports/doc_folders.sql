--
-- PostgreSQL database dump
--

\restrict WsZIPUihdTn2JVz1pRPdew8H6VYcfarD9NUAwW6YS1bLvAhGpdmJR03rl11922D

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

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
-- Data for Name: doc_folders; Type: TABLE DATA; Schema: public; Owner: paperclip
--

INSERT INTO public.doc_folders VALUES ('1eba1419-3d99-4a92-8cb2-d03ee6d124b3', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', NULL, '01_STRATEGY_&_GOVERNANCE', '/01_STRATEGY_&_GOVERNANCE', 'ceo', 1, '2026-03-30 17:51:45.389426+00', '2026-03-30 17:51:45.389426+00');
INSERT INTO public.doc_folders VALUES ('0d2eb187-8b2a-4986-9f54-dce88f8d62ef', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1eba1419-3d99-4a92-8cb2-d03ee6d124b3', 'Vision_&_Thesis_Papers', '/01_STRATEGY_&_GOVERNANCE/Vision_&_Thesis_Papers', 'ceo', 1, '2026-03-30 17:51:45.397482+00', '2026-03-30 17:51:45.397482+00');
INSERT INTO public.doc_folders VALUES ('c9ca95d7-3782-4631-be92-4fc4215a8e2d', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1eba1419-3d99-4a92-8cb2-d03ee6d124b3', 'Executive_Summaries', '/01_STRATEGY_&_GOVERNANCE/Executive_Summaries', 'ceo', 2, '2026-03-30 17:51:45.402112+00', '2026-03-30 17:51:45.402112+00');
INSERT INTO public.doc_folders VALUES ('1815cf6e-41db-4162-8f8b-c3285caaad6f', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', NULL, '02_RESEARCH_VAULT', '/02_RESEARCH_VAULT', 'research_specialist', 2, '2026-03-30 17:51:45.406801+00', '2026-03-30 17:51:45.406801+00');
INSERT INTO public.doc_folders VALUES ('8fd5004e-9b90-4969-84c5-7ebb61bd0fea', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1815cf6e-41db-4162-8f8b-c3285caaad6f', '02.1_Primary_Sources', '/02_RESEARCH_VAULT/02.1_Primary_Sources', 'research_specialist', 1, '2026-03-30 17:51:45.411056+00', '2026-03-30 17:51:45.411056+00');
INSERT INTO public.doc_folders VALUES ('b00879fd-1583-42ad-8ccc-7113cce348b6', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1815cf6e-41db-4162-8f8b-c3285caaad6f', '02.2_Tech_Stack_Audits', '/02_RESEARCH_VAULT/02.2_Tech_Stack_Audits', 'research_specialist', 2, '2026-03-30 17:51:45.416304+00', '2026-03-30 17:51:45.416304+00');
INSERT INTO public.doc_folders VALUES ('972d6ad1-5964-4448-b66e-28a9a7327ef3', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1815cf6e-41db-4162-8f8b-c3285caaad6f', '02.3_Pedagogical_Frameworks', '/02_RESEARCH_VAULT/02.3_Pedagogical_Frameworks', 'research_specialist', 3, '2026-03-30 17:51:45.42193+00', '2026-03-30 17:51:45.42193+00');
INSERT INTO public.doc_folders VALUES ('c1619977-ec8f-461b-9c09-a1b6a46e16fb', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '1815cf6e-41db-4162-8f8b-c3285caaad6f', '02.4_Competitive_Intelligence', '/02_RESEARCH_VAULT/02.4_Competitive_Intelligence', 'research_specialist', 4, '2026-03-30 17:51:45.429286+00', '2026-03-30 17:51:45.429286+00');
INSERT INTO public.doc_folders VALUES ('ba5816b8-4e08-460d-a0d6-74ffaa575833', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', NULL, '03_OPERATIONS_&_EXECUTION', '/03_OPERATIONS_&_EXECUTION', 'executive_assistant', 3, '2026-03-30 17:51:45.437697+00', '2026-03-30 17:51:45.437697+00');
INSERT INTO public.doc_folders VALUES ('1716f8a8-d47e-4cdc-9701-e5a538e0aa30', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'ba5816b8-4e08-460d-a0d6-74ffaa575833', 'Project_Schedules', '/03_OPERATIONS_&_EXECUTION/Project_Schedules', 'executive_assistant', 1, '2026-03-30 17:51:45.441786+00', '2026-03-30 17:51:45.441786+00');
INSERT INTO public.doc_folders VALUES ('861989f8-8bf9-4b4c-bd41-fc38f9d9e8bd', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'ba5816b8-4e08-460d-a0d6-74ffaa575833', 'Meeting_Minutes', '/03_OPERATIONS_&_EXECUTION/Meeting_Minutes', 'executive_assistant', 2, '2026-03-30 17:51:45.444794+00', '2026-03-30 17:51:45.444794+00');
INSERT INTO public.doc_folders VALUES ('7f75fcc3-0e60-4012-b8f2-a313616e2665', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'ba5816b8-4e08-460d-a0d6-74ffaa575833', 'Resource_Directory', '/03_OPERATIONS_&_EXECUTION/Resource_Directory', 'executive_assistant', 3, '2026-03-30 17:51:45.449462+00', '2026-03-30 17:51:45.449462+00');
INSERT INTO public.doc_folders VALUES ('3dc32700-0ce5-43dd-b072-6b1e12730788', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', NULL, '04_KNOWLEDGE_BASE', '/04_KNOWLEDGE_BASE', 'shared', 4, '2026-03-30 17:51:45.452006+00', '2026-03-30 17:51:45.452006+00');
INSERT INTO public.doc_folders VALUES ('229ad642-1e5e-438d-8467-eeeab5e29f0f', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', '3dc32700-0ce5-43dd-b072-6b1e12730788', 'Glossary_of_Terms', '/04_KNOWLEDGE_BASE/Glossary_of_Terms', 'shared', 1, '2026-03-30 17:51:45.456069+00', '2026-03-30 17:51:45.456069+00');
INSERT INTO public.doc_folders VALUES ('d8341900-4e6b-469d-8c9f-832b424ecf43', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', NULL, '00_PAPERCLIP_ROOT', '/00_PAPERCLIP_ROOT', 'all', 0, '2026-03-31 13:04:39.219836+00', '2026-03-31 13:04:39.219836+00');


--
-- PostgreSQL database dump complete
--

\unrestrict WsZIPUihdTn2JVz1pRPdew8H6VYcfarD9NUAwW6YS1bLvAhGpdmJR03rl11922D

