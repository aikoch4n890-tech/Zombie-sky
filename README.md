# Zombie Sky – Live interativa do TikTok

Jogo de aviões e helicópteros contra hordas de zumbis, feito para live.
O público entra digitando **!avião** ou **!heli** no chat. Presentes e curtidas mexem no jogo.

## Arquivos
- `index.html` – o jogo
- `server.js` – servidor que abre o jogo e lê a live do TikTok
- `package.json` – lista do que o servidor precisa
- `render.yaml` – configuração pronta para o Render

## Como abrir na live
`https://SEU-SITE.onrender.com/?user=SEU_ARROBA`

Troque `SEU_ARROBA` pelo seu @ do TikTok, sem o @. O jogo conecta sozinho quando a live estiver aberta.

## Comandos do chat
| Comando | O que faz |
|---|---|
| `!avião` / `!heli` | entra na partida |
| `!trocar` | troca avião ↔ helicóptero |
| `!sair` | sai da partida |

## Presentes
| Presente | Efeito |
|---|---|
| Rosa | +1 nível para todos |
| 10–99 moedas | horda de 1.000 zumbis |
| 100+ moedas | chefe com o nome de quem mandou |
| 100 curtidas | conserta a aeronave de quem curtiu |

## Configuração opcional
Se a conexão com a live falhar muito, crie uma chave grátis em eulerstream.com e coloque no Render em
**Environment → EULER_API_KEY**.
