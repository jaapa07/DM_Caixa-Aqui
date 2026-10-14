# DM Caixa Aqui — Gestão Operacional

Aplicação web para organizar o fluxo operacional de processos de crédito imobiliário: atendimento a corretores, recebimento e conferência de documentos, triagem, cadastro operacional e **revisão cadastral por um segundo profissional** (sócio avaliador), com histórico completo e controle de acesso no banco de dados.

> **Importante:** a “aprovação da conferência cadastral” indica apenas que a **revisão interna** foi concluída. **Não** representa aprovação de crédito, financiamento ou subsídio. A decisão oficial é exclusiva da instituição financeira. O sistema não faz análise de elegibilidade automática.

Identidade visual **provisória** (tipográfica, azul‑marinho). O perfil @dmcaixaaqui foi consultado apenas como referência de posicionamento; o logotipo oficial **não** foi reproduzido. Substitua‑o quando o arquivo oficial estiver disponível (ver “Pendências”).

---

## Sumário

1. [Arquitetura](#arquitetura)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Teste rápido — só com Node.js](#teste-rápido--só-com-nodejs-modo-demonstração)
4. [Executar no Windows com Visual Studio Code (Supabase)](#executar-no-windows-com-visual-studio-code-supabase)
5. [Configurar o banco no Supabase](#configurar-o-banco-no-supabase)
6. [Criar usuários](#criar-usuários)
7. [Ambiente local sem Supabase (Linux/macOS)](#ambiente-local-sem-supabase-linuxmacos)
8. [Testes](#testes)
9. [Implantação](#implantação)
10. [Segurança e LGPD](#segurança-e-lgpd)
11. [Funcionalidades concluídas e pendentes](#funcionalidades-concluídas-e-pendentes)

---

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Interface | Next.js 15.5 (App Router), React 19, TypeScript estrito, Tailwind CSS 4, componentes no padrão shadcn/ui (Radix), Lucide, React Hook Form + Zod, TanStack Table, Recharts |
| Servidor | Server Components, Server Actions e Route Handlers |
| Banco | PostgreSQL (Supabase) com **RLS em todas as tabelas**, funções `SECURITY DEFINER` para o fluxo, migrações SQL versionadas |
| Autenticação | Supabase Auth (e‑mail e senha, recuperação por e‑mail) |
| Arquivos | Supabase Storage — bucket **privado** `case-documents`, URLs assinadas de curta duração |

**Como o RLS é aplicado.** O servidor conecta ao Postgres e, em cada requisição, executa as consultas dentro de uma transação com `role = authenticated` e `request.jwt.claims.sub = <id do usuário validado pelo Supabase Auth>` — o mesmo mecanismo usado pelo PostgREST. Assim, **todas as políticas RLS valem para tudo o que a interface faz**, além de transações atômicas para mudanças de status (processo + histórico + atribuição + auditoria + notificação na mesma transação).

- Mudanças de status, documentos, pendências, revisão e correções só ocorrem por **funções do banco** (`create_case`, `forward_case`, `start_review`, `return_case`, `approve_review`, `register_correction`, `register_document`, …), que validam papel, organização, etapa e regras (ex.: não encaminhar com pendência crítica).
- Regras de transição ficam na tabela `case_status_transitions` (consultável em **Configurações › Status e transições**).
- Completude do cadastro é calculada em um só lugar: `get_case_readiness()` (usado pela interface e pelos bloqueios).
- O CPF não é legível por consulta direta (privilégio de coluna). É exibido sob demanda por `reveal_client_cpf()` e cada exibição/busca é auditada.
- `audit_logs`, `case_status_history`, `document_reviews` e `request_events` são **somente de acréscimo** (gatilhos impedem alteração e exclusão).

**Drivers locais (apenas desenvolvimento/testes).** Para permitir rodar e testar sem Supabase, há drivers `AUTH_DRIVER=local` / `STORAGE_DRIVER=local` (senha bcrypt em `auth.users`, sessão em cookie JWT `httpOnly`; arquivos em disco com links HMAC de curta duração). Eles **só funcionam com `LOCAL_SUPABASE_SHIM=true`** (banco local) e são recusados em qualquer outra configuração.

## Estrutura do projeto

```
supabase/
  migrations/          # 001 esquema · 002 RLS/privilégios/auditoria · 003 fluxo (RPC) · 004 bootstrap + Storage · 005 exportação/CPF · 006 textos da linha do tempo
  local/00_supabase_shim.sql   # SÓ para Postgres local (papéis, auth.uid(), storage) — nunca aplicar no Supabase
scripts/
  db-migrate.mjs  db-reset.mjs  local-db.mjs  seed.ts  create-admin.ts
src/
  app/(auth)/          # login, recuperação e redefinição de senha
  app/(app)/           # telas autenticadas (dashboard, atendimentos, processos, revisão, …)
  app/api/             # documentos (acesso autorizado), CEP, CSV, arquivos locais
  components/          # ui/ (base), layout/, cases/, registration/, documents/, requests/, reviews/, admin/, charts/
  lib/actions/         # Server Actions por domínio
  lib/server/          # env, conexão, auth (drivers), storage (drivers), consultas
  lib/validation.ts    # esquemas Zod compartilhados (cliente e servidor)
tests/
  unit/  db/  e2e/
```

## Teste rápido — só com Node.js (modo demonstração)

Para conhecer e testar o sistema **sem instalar PostgreSQL nem criar conta no Supabase**. Precisa apenas do **Node.js 20 ou mais recente** (versão LTS em https://nodejs.org).

**Windows (mais simples):** descompacte o projeto e dê dois cliques em **`INICIAR-DEMO.bat`**. Na primeira vez ele instala as dependências e prepara o app (alguns minutos); depois o navegador abre sozinho em `http://localhost:3000`.

**Pelo terminal (Windows, macOS ou Linux):**

```bash
npm install
npm run demo
```

Entre com um dos usuários fictícios (senha **`Demo-Local-2026`**):

| E‑mail | Papel |
|---|---|
| `operador@demo.dmcaixa.local` | Operador de cadastro |
| `avaliador@demo.dmcaixa.local` | Sócio avaliador |
| `admin@demo.dmcaixa.local` | Administrador |

- Os dados ficam na pasta `.demo/` do projeto e **continuam lá** quando você fecha e abre de novo (Ctrl+C encerra).
- `npm run demo:reset` apaga tudo e recria os dados de demonstração. `npm run demo:dev` abre em modo desenvolvimento (recarrega ao editar o código). Para usar outra porta: `PORT=3001 npm run demo` (PowerShell: `$env:PORT=3001; npm run demo`).
- Como funciona: o banco é o **PGlite** (PostgreSQL compilado para WebAssembly) rodando dentro do processo Node, com **as mesmas migrações, RLS e funções** do Supabase; login e arquivos usam os drivers locais dos testes. A suíte E2E completa passa neste modo (`E2E_PGLITE=1 npx playwright test`).
- Se o Windows perguntar sobre o firewall para o “Node.js”, você pode clicar em **Cancelar**: o acesso pelo próprio computador continua funcionando.
- **Somente para teste/demonstração em um computador.** Não use com dados reais nem como produção: para isso, siga as seções do Supabase abaixo.

## Executar no Windows com Visual Studio Code (Supabase)

Recomendado para Windows: usar um **projeto Supabase** (o plano gratuito serve para desenvolvimento).

1. Instale **Node.js 20 LTS ou 22** (https://nodejs.org), **Git** e o **Visual Studio Code**. Extensões úteis: *ESLint*, *Tailwind CSS IntelliSense*, *Playwright Test*.
2. Abra a pasta do projeto no VS Code e, no terminal (PowerShell):
   ```powershell
   npm install
   copy .env.example .env.local
   ```
3. Crie o projeto no Supabase e preencha `.env.local` (veja a próxima seção). Mantenha `AUTH_DRIVER=supabase` e `STORAGE_DRIVER=supabase`.
4. Aplique as migrações e crie o primeiro administrador:
   ```powershell
   npm run db:migrate
   $env:ORG_NAME="DM Caixa Aqui"; $env:ORG_SLUG="dm-caixa-aqui"; $env:ADMIN_NAME="Seu nome"; $env:ADMIN_EMAIL="voce@empresa.com.br"; $env:ADMIN_PASSWORD="SenhaForte2026"
   npm run setup:admin
   ```
5. (Opcional, **somente em projeto de testes**) dados fictícios: `$env:DEMO_PASSWORD="SenhaDeTeste2026"; $env:SEED_CONFIRM="sim"; npm run seed`.
6. `npm run dev` e acesse http://localhost:3000.

## Configurar o banco no Supabase

1. **Novo projeto** (região São Paulo recomendada).
2. **Project Settings › API**: copie *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`, *anon key* → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, *service_role key* → `SUPABASE_SERVICE_ROLE_KEY` (**somente servidor**).
3. **Project Settings › Database › Connection string**: use a conexão **Session pooler (porta 5432)** ou a conexão direta → `DATABASE_URL`. (O pooler em modo transação também funciona: as consultas usam transações e `prepare: false`.)
4. **Migrações**: `npm run db:migrate` (registra o que foi aplicado em `app.schema_migrations`). Alternativa: executar os arquivos de `supabase/migrations/` em ordem no *SQL Editor* ou via `supabase db push` (Supabase CLI). **Não** execute `supabase/local/00_supabase_shim.sql` no Supabase.
5. A migração 004 cria o bucket privado `case-documents` (sem políticas para usuários: o acesso é feito pelo servidor após autorização no banco).
6. **Authentication › Providers › Email**: desative “Allow new users to sign up” (contas são criadas pelo administrador). **Authentication › URL Configuration**: Site URL = `APP_URL`; adicione `APP_URL/auth/callback` em *Redirect URLs* (recuperação de senha).
7. **Agendamentos recomendados** (Database › Cron / pg_cron): executar diariamente `select public.generate_due_notifications(id) from public.organizations;` como usuário de serviço (o sistema também gera os avisos ao abrir o dashboard e as notificações).
8. Novas migrações criadas no futuro devem **revogar privilégios padrão** de `anon`/`authenticated` e habilitar RLS (o Supabase concede privilégios automaticamente a tabelas e funções novas do schema `public`).

## Criar usuários

- **Primeiro administrador:** `npm run setup:admin` (variáveis `ORG_NAME`, `ORG_SLUG`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- **Demais usuários:** pela tela **Usuários e permissões** (somente ADMIN). Papéis: **Administrador**, **Operador de cadastro**, **Sócio avaliador**. Cada pessoa tem conta própria; desativar a conta bloqueia o login e retira o acesso.
- **Recuperação de senha:** link “Esqueci minha senha” (Supabase Auth envia o e‑mail). O administrador também pode redefinir a senha de um usuário.

## Ambiente local sem Supabase (Linux/macOS)

Útil para desenvolvimento e para rodar os testes de integração. Requer PostgreSQL 15+ instalado (binários `initdb`/`pg_ctl`).

```bash
npm install
cp .env.example .env.local      # descomente o bloco "desenvolvimento local SEM Supabase"
npm run db:local:start          # PostgreSQL em 127.0.0.1:54329
npm run db:reset                # cria o banco, aplica o shim e as migrações
DEMO_PASSWORD='Senha-Local-2026' npm run seed
npm run dev
```

Usuários de demonstração (**somente desenvolvimento**, senha = `DEMO_PASSWORD`): `admin@demo.dmcaixa.local`, `operador@demo.dmcaixa.local`, `avaliador@demo.dmcaixa.local`. O seed executa o fluxo real pelas funções do banco e cria 3 corretores, 5 clientes fictícios e processos em etapas distintas: novo contato, pendência com corretor (solicitação vencida), aguardando revisão, devolvido para correção e conferência aprovada. Todos os CPFs, documentos (PDFs gerados com a marca “DOCUMENTO FICTÍCIO”) e valores são fictícios.

## Testes

| Comando | O que cobre |
|---|---|
| `npm run test:unit` | Máscaras e validação de CPF/CNPJ, datas DD/MM/AAAA, moeda, tipo real de arquivo, nomes seguros, campos condicionais (estado civil, dependentes, imóvel, vínculos), regras de rejeição/observação, modelos de mensagem, token de sessão |
| `npm run test:db` | **Integração em PostgreSQL real** com as migrações: separação entre organizações, usuário sem vínculo, CPF restrito e auditado, avaliador só vê encaminhados, operador sem ações do avaliador, avaliador sem edição do cadastro, administração restrita, bloqueio de encaminhamento com pendência crítica, versões de documento, upload fora do processo, acesso a documento de outro processo/organização, transições e motivos, numeração, ciclo devolução → correção → reencaminhamento → aprovação (rodada vinculada à anterior e parecer preservado), auditoria somente de acréscimo e sem dados pessoais, pendência “copiar ≠ enviar” |
| `npm run test:e2e` | Playwright contra o build de produção (banco local recém‑semeado): login/erro/mostrar senha/logout, redirecionamento sem sessão, acesso negado por papel, API de documentos sem sessão, novo atendimento, **salvamento automático e persistência após recarregar**, validação sem limpar o formulário, upload real × arquivo falso, link assinado adulterado, pendência (copiar não altera status), fluxo completo de revisão em duas rodadas, layout móvel |

Os testes de banco e E2E usam o PostgreSQL local (`npm run db:local:start`). Variáveis: `TEST_DATABASE_URL`, `E2E_DATABASE_URL`.

## Implantação

Sugestão: **Vercel** (ou outro host Node 20+) + **Supabase**.

1. Configure as variáveis do `.env.example` no host (`AUTH_DRIVER=supabase`, `STORAGE_DRIVER=supabase`, `APP_URL=https://seu-dominio`). **Nunca** use `NEXT_PUBLIC_` em `SUPABASE_SERVICE_ROLE_KEY`.
2. `npm run build` / `npm start` (o host executa automaticamente).
3. Aplique as migrações no projeto de produção antes do primeiro deploy e crie o administrador.
4. Cabeçalhos de segurança já configurados em `next.config.ts` (HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
5. Faça backups do banco (Supabase › Database › Backups) e do Storage conforme a política de retenção acordada.

## Segurança e LGPD

Implementado:

- Menor privilégio: nada para `anon`; `authenticated` só lê o necessário e escreve diretamente apenas em tabelas de cadastro editáveis; o restante passa por funções com verificações explícitas. RLS em todas as tabelas, por organização e papel; edição bloqueada enquanto o cadastro está com o avaliador.
- Validação no servidor (Zod + restrições do banco), autorização em todas as ações; mensagens de erro sem detalhes internos.
- Sessões: cookies `httpOnly` (Supabase SSR ou JWT local), validação do usuário a cada requisição, expiração tratada sem perder dados digitados (diálogo de novo login).
- Upload: bucket privado, verificação da **assinatura binária** (PDF/JPG/PNG/WEBP) além da extensão, limite configurável, nome sanitizado, caminho `org/processo/documento/arquivo` validado no banco, URL assinada de curta duração (padrão 60 s), acesso e download auditados, versões preservadas, rejeição com motivo obrigatório.
- CPF fora de listas e exportações; revelação/busca registradas. Logs registram **quais campos** mudaram, não os valores.
- Exportação CSV somente para ADMIN, com campos mínimos (cliente abreviado; sem CPF, documentos ou valores de renda), proteção contra injeção de fórmulas e registro em auditoria.
- Política de retenção configurável, eliminação de arquivos fora do prazo, registro de solicitações de titulares e anonimização (quando cabível), em **Configurações › Privacidade e retenção**.
- Nenhum dado pessoal é guardado em `localStorage`; nenhum documento é enviado a serviços externos (inclusive IA). Não há envio automático por WhatsApp ou e‑mail.

Não substitui: avaliação jurídica dos prazos de retenção e bases legais, contrato com operadores (Supabase/host), política de privacidade publicada, gestão de incidentes, MFA para administradores (recomendado ativar no Supabase Auth) e revisão de segurança antes de produção. **Implementar estas funções não garante, por si só, conformidade com a LGPD.**

## Funcionalidades concluídas e pendentes

### Concluídas e verificadas neste ambiente
- Telas: login, recuperação/redefinição de senha, dashboards do operador e do avaliador (indicadores e gráficos calculados do banco), atendimentos (lista, novo, detalhes com histórico de contatos), corretores (lista, cadastro, edição, ativação), processos (lista, criação, visão geral), triagem com questionário e pontos a confirmar, checklist documental configurável e versionado, pendências (por processo e painel geral, modelos de mensagem, copiar, registrar envio/cobrança/resposta, vincular arquivos), cadastro operacional em 9 etapas com salvamento automático e participantes adicionais, central de documentos, fila de revisão, revisão em duas áreas (dados × documentos/checklist) com divergências e observações, correções devolvidas, linha do tempo/auditoria, notificações internas, relatórios com CSV, usuários e permissões, configurações (identidade, upload, prazos, categorias, checklists, tipos de pendência, modelos, status/transições, privacidade e retenção), busca global, perfil, acesso negado, erro e “não encontrado”.
- Banco: 6 migrações, RLS, funções de fluxo, auditoria somente de acréscimo, seed fictício, script do primeiro administrador.
- Qualidade: `tsc` estrito, ESLint sem avisos, build de produção, 44 testes unitários/integração e 12 testes E2E (desktop e móvel) aprovados no ambiente local — tanto com PostgreSQL quanto no modo demonstração (PGlite). Dependências de produção sem vulnerabilidades conhecidas no `npm audit` (Next.js 15.5.27 com correções de segurança).

### Implementado, mas **não testado** aqui (dependem de serviços externos indisponíveis neste ambiente)
- **Supabase Auth e Supabase Storage reais** (drivers `supabase`): o código usa as APIs oficiais (`@supabase/ssr`, `auth.admin`, `createSignedUrl`), mas o ambiente de desenvolvimento não tinha acesso à rede do Supabase. Os testes cobriram os drivers locais equivalentes. Valide login, recuperação de senha, upload e visualização após configurar seu projeto.
- **Consulta de CEP** (ViaCEP via servidor): o acesso externo estava bloqueado aqui; o preenchimento manual funciona e a consulta falha de forma segura.
- **Aplicação das migrações em um projeto Supabase**: testadas em PostgreSQL 16 com o shim de compatibilidade; recomenda‑se aplicar primeiro em um projeto de homologação.

### Pendentes / fora do escopo desta versão
- Logotipo e cores oficiais da DM Caixa Aqui (enviar o arquivo para substituição de `src/components/brand/logo.tsx` e `src/app/icon.svg`).
- Integrações oficiais com WhatsApp Business e Instagram (estrutura preparada: `contact_interactions.channel/external_ref`; requer contas, autenticação e autorização das plataformas).
- Envio de notificações por e‑mail/WhatsApp (somente notificações internas, por decisão de segurança).
- Upload do logotipo pela tela de identidade (hoje a identidade é configurada por texto/cor e arquivo no código).
- Agendamento automático de notificações de prazo e de eliminação por retenção (executados sob demanda; ver pg_cron acima).
- MFA e políticas de senha do provedor (configurar no Supabase Auth).
