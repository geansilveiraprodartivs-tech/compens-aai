import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { notifySignup } from "@/lib/signupAlert.functions";

/**
 * Avisa o dono do app quando alguém cria uma conta.
 *
 * Roda uma única vez por sessão do navegador (e é idempotente no servidor via
 * `signup_notified_at`), então abrir o app de novo no dia seguinte não repete
 * o alerta. Fica dentro do `AppShell`, ou seja: qualquer entrada no app
 * autenticado cobre cadastro por e-mail, por Google e confirmação de e-mail.
 */
const SESSION_KEY = "compensai:signup-alert-sent";

export function SignupAlertPing() {
  const notify = useServerFn(notifySignup);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
    } catch {
      // sessionStorage bloqueado: segue para a chamada (o servidor deduplica).
    }

    void notify()
      .then(() => {
        try {
          window.sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          // Sem sessionStorage não tem problema: o servidor já marcou a conta.
        }
      })
      .catch(() => {
        // Falha do alerta nunca deve atrapalhar o uso do app.
      });
  }, [notify]);

  return null;
}
