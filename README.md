# Smart Shopper

COMPENSAI — MVP FUNCIONAL
Logotipo em anexo!

Crie um SaaS chamado CompensAI, uma plataforma que ajuda o usuário a descobrir:

ONDE COMPENSA COMPRAR?
O QUE COMPENSA COMPRAR?
QUANTO ECONOMIZO?

Não crie apenas uma landing page ou protótipo visual. Crie um MVP funcional, preparado para evoluir.

TECNOLOGIA

Use:

React + TypeScript

Vite

Tailwind CSS

Supabase

Supabase Auth

Supabase Database

RLS

Priorize código simples, reutilizável e econômico em créditos.

1. LOCALIZAÇÃO

Na primeira entrada perguntar:

📍 Onde você faz suas compras?

Opções:

Usar minha localização

Informar CEP

Escolher cidade/bairro manualmente

Se permitir localização, utilizar a posição para encontrar supermercados próximos.

Mostrar na Home:

📍 Minha localização

Permitir alterar posteriormente.

A localização serve para encontrar mercados próximos e personalizar os preços pesquisados.

2. PESQUISA DE PREÇOS

O grande diferencial do CompensAI é pesquisar preços e promoções atuais online.

Criar uma estrutura preparada para pesquisar fontes reais dos supermercados, priorizando:

sites oficiais

lojas online oficiais

páginas de ofertas

encartes oficiais

APIs/feeds quando disponíveis

Não utilizar preços fictícios como se fossem reais.

Cada preço deve guardar:

produto

supermercado

preço

quantidade

unidade

fonte

URL

data/hora da atualização

validade da promoção

Nunca mostrar promoção vencida como atual.

Se os dados estiverem desatualizados ou insuficientes, informar isso claramente.

Criar botão:

🔄 Atualizar preços

Preparar o sistema para atualização automática posteriormente.

3. TOP 5 MERCADOS

Na Home, destacar:

🏆 Onde compensa comprar?

Mostrar os 5 mercados com melhor resultado na região.

Cada card deve apresentar:

posição

mercado

distância

preço estimado da compra

economia estimada

promoções

última atualização

Destacar visualmente o primeiro colocado.

Explicar por que ele aparece naquela posição.

Não considerar apenas distância. Usar principalmente:

preço + promoções + economia + relevância para a compra + distância + atualização dos dados.

4. LISTA DE COMPRAS

Permitir criar uma lista.

Cada produto deve ter:

nome

marca

quantidade

unidade

preço

subtotal

Calcular automaticamente:

quantidade × preço = subtotal

Mostrar sempre:

Total da compra

Atualizar em tempo real.

5. COMPARAR

Criar botão:

⚖️ Comparar

Permitir comparar:

marcas

tamanhos

mercados

preços

preço por kg

preço por litro

preço por unidade

Normalizar unidades como:

1kg = 1000g
1L = 1000ml

Mostrar qual opção possui melhor custo por unidade de medida.

6. ECONOMIA

Separar:

💰 Economia real

Quanto o usuário realmente economizou.

💡 Economia potencial

Quanto poderia economizar escolhendo outra opção.

Durante a compra mostrar:

Total: R$ 187,40
Economia: R$ 26,80

7. MODO COMPRA

Criar um modo simples para acompanhar a compra.

O usuário marca os produtos conforme compra.

Mostrar:

produtos comprados

total

economia

orçamento

valor restante

Tudo atualizado em tempo real.

8. FINAL DA COMPRA

Ao finalizar, mostrar:

🛒 Compra concluída

total gasto

economia real

economia potencial

quantidade de produtos

promoções utilizadas

mercado escolhido

Salvar no histórico.

9. BANCO DE DADOS

Criar inicialmente apenas as tabelas essenciais:

users

stores

store_locations

products

brands

product_prices

promotions

price_sources

shopping_lists

shopping_list_items

shopping_sessions

savings_records

Estruturar de forma que posteriormente seja possível adicionar histórico, IA, alertas e recursos PRO.

10. SEGURANÇA

Usar:

Supabase Auth

login

recuperação de senha

RLS

Cada usuário deve acessar somente seus próprios dados.

11. DESIGN

Interface moderna, premium e mobile-first.

Cores:

preto

roxo

lilás

rosa/magenta

Usar:

gradientes

glow discreto

cards arredondados

glassmorphism moderado

tipografia moderna

12. NAVEGAÇÃO

Criar:

🏠 Início
🛒 Lista
⚖️ Comparar
💰 Economia
👤 Perfil

13. IMPORTANTE SOBRE O MVP

Como este projeto está sendo desenvolvido inicialmente com recursos limitados, não gaste créditos criando recursos secundários antes do núcleo funcionar.

Prioridade absoluta:

1. Localização

2. Supermercados próximos

3. Pesquisa de preços atuais

4. Top 5 mercados

5. Lista de compras

6. Comparação

7. Total automático

8. Economia

9. Modo compra

10. Histórico básico

Deixe para uma segunda etapa:

IA avançada

notificações

alertas de preço

barcode

OCR de nota fiscal

cashback

WhatsApp

colaboração familiar

planos PRO

recursos avançados

IMPORTANTE: não simular pesquisa online. Se uma fonte real não puder ser acessada diretamente, criar a estrutura de integração e deixar claramente preparado para receber a API/feed/fonte real.

O objetivo deste primeiro build é entregar um MVP funcional, leve, rápido e com arquitetura correta, evitando gastar créditos do Lovable com funcionalidades que não são essenciais para validar o CompensAI.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://compens-aai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c1d3e7be-31bc-49a7-9214-691b706213cb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
