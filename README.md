⚖️ LexTech AI

Cerebro Digital Jurídico | ERP Cloud Nativo

La próxima generación de gestión legal impulsada por Inteligencia Artificial Generativa.

🚨 AVISO DE ARQUITECTURA CRÍTICA 




Este repositorio contiene el código fuente de LexTech AI, diseñado para sustituir sistemas legacy (ej. MNProgram) mediante arquitectura de vanguardia. Está estrictamente prohibido el uso de tecnologías obsoletas (.NET antiguo, PHP) o tipado dinámico (any en TypeScript).

🧠 ¿Qué es LexTech AI?

LexTech AI no es un "gestor de expedientes" tradicional, es un Cerebro Digital Corporativo. Es una plataforma SPA (Single Page Application) multi-tenant con un backend asíncrono y una capa de persistencia vectorial. Su propósito principal es erradicar el trabajo administrativo manual (estimado en un 30% del tiempo operativo) mediante automatización cognitiva, permitiendo escalar la capacidad de facturación del despacho sin aumentar el OPEX administrativo.

✨ Capacidades Core

⚡ Automatización Proactiva: Lectura de notificaciones (LexNet), agendado automático de plazos y generación de borradores procesales.

🔍 Búsqueda Semántica (RAG): Recuperación de memoria institucional basada en el significado (embeddings vectoriales), no en simples palabras clave.

🛡️ Seguridad Zero-Trust: Encriptación AES-256 en reposo, TLS 1.3 en tránsito y autenticación MFA obligatoria (Clerk/Auth0 + DNI/Certificado).

🛠 Stack Tecnológico (Estándares 2025)

Nuestra arquitectura sigue el paradigma MACH (Microservices, API-first, Cloud-native, Headless).

Capa

Tecnologías Clave

Propósito Arquitectónico

🎨 Frontend (SPA)

React, Vite, TypeScript

Alta velocidad de renderizado y tipado estricto E2E.

💅 UI/UX

Shadcn/UI, Tailwind CSS

Sistema de diseño corporativo moderno y responsivo.

⚙️ Backend Core

Node.js (NestJS/Express)

Arquitectura I/O non-blocking para la API principal.

🐍 Workers / ETL

Python (Pandas, PyTorch)

Microservicios aislados para procesamiento pesado y migración.

🗄️ Base de Datos

PostgreSQL + pgvector

ACID compliance (facturación) + Motor Vectorial (IA).

📦 Almacenamiento

AWS S3 / GCS

Documentos cifrados con URLs firmadas temporalmente.

🤖 Motor IA

Google Gemini 1.5 Pro/Flash

Ventana de 1M+ tokens para ingesta de expedientes masivos.

🗺️ Hoja de Ruta de Ejecución

El proyecto se despliega en 4 fases críticas para garantizar la estabilidad operativa:

[ ] Fase 1: Cimientos y GRC. CI/CD, Monorepo, DB Multi-Tenant, Auth (MFA) y UI Kit base.

[ ] Fase 2: Core Operativo. Paridad con legacy. Gestión 360 de Entidades, Expedientes, Timeline y Gestor Documental. Editor/Visor PDF integrado.

[ ] Fase 3: Inteligencia Cognitiva. RAG con pgvector, auto-etiquetado documental, redacción generativa y automatización de agenda.

[ ] Fase 4: Hiperconectividad. Integración bidireccional API Gmail/Outlook, WhatsApp Business API y portales de clientes.

🚨 Protocolo de Migración Crítica (Legacy a Cloud)

La migración desde bases de datos relacionales legacy (SQL Server / File Systems) se rige por el principio de la "Piedra Rosetta". NUNCA se migra directamente a las tablas de producción sin mapeo.

Se utiliza una tabla intermedia migration_map para mantener la integridad referencial profunda (legacy_id -> new_uuid).

Fases del ETL (Scripts Python):

Saneamiento (Pre-Migración).

Extracción y Transformación (Capa Maestros -> Capa Operativa).

Migración Documental Masiva (S3 Multi-hilo).

Validación Paralela (Staging vs Legacy).

💻 Entorno de Desarrollo (Setup Local)

Requisitos Previos

Node.js (v20+)

pnpm o Yarn

Docker & Docker Compose (PostgreSQL + pgvector)

Python 3.11+ (Microservicios ETL)

Instrucciones de Arranque

Clonar el repositorio:

git clone [https://github.com/tu-organizacion/lextech-ai.git](https://github.com/tu-organizacion/lextech-ai.git)
cd lextech-ai


Levantar infraestructura local (DB & Storage):

docker-compose up -d


Instalar dependencias del Monorepo:

pnpm install


Configurar variables de entorno:

Copia .env.example a .env en apps/frontend y apps/backend. Configura tus claves de Clerk/Auth0, Gemini API y DB URL.

Ejecutar en modo desarrollo:

pnpm dev


🛡️ Gobernanza, Riesgos y Cumplimiento (GRC)

🇪🇺 Soberanía del Dato: Infraestructura desplegada exclusivamente en regiones de la Unión Europea (Cumplimiento RGPD/GDPR).

🔒 Privacidad de IA (Zero Data Retention): Uso de APIs de grado empresarial que garantizan por contrato el NO entrenamiento de modelos fundacionales con los datos de nuestros expedientes.

🗑️ Derecho al Olvido: Implementación estricta de "Soft Deletes" y anonimización criptográfica.
