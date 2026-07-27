import nodemailer from "../../vendor/nodemailer/lib/nodemailer.js";
import { loadServerConfig } from "../config.js";
import {
  looksLikeEmail,
  runSuccessMailBuilder,
} from "./RunSuccessMailBuilder.js";

export class MailService {
  constructor({
    getConfig = () => loadServerConfig().smtp,
    builder = runSuccessMailBuilder,
  } = {}) {
    this.getConfig = getConfig;
    this.builder = builder;
  }

  getSmtpConfig() {
    const cfg = this.getConfig() || {};
    return {
      enabled: Boolean(cfg.enabled),
      host: cfg.host || "",
      port: Number(cfg.port || 465),
      secure: Boolean(cfg.secure),
      user: cfg.user || "",
      pass: cfg.pass || "",
      from: cfg.from || cfg.user || "",
    };
  }

  resolveFromAddress(cfg) {
    const from = cfg.from || cfg.user;
    if (looksLikeEmail(from)) return from;
    if (cfg.user && !cfg.user.includes("@")) {
      return `${cfg.user}@iitd.ac.in`;
    }
    return from;
  }

  createTransport() {
    const cfg = this.getSmtpConfig();
    if (!cfg.enabled) {
      throw new Error("SMTP is disabled");
    }
    if (!cfg.host || !cfg.user || !cfg.pass) {
      throw new Error("SMTP host/user/password not configured");
    }
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
    });
    return { transporter, cfg, from: this.resolveFromAddress(cfg) };
  }

  async sendRunSuccess({ to, run, token, kind = "manual" } = {}) {
    const email = String(to || token?.email || "").trim();
    if (!looksLikeEmail(email)) {
      return { skipped: true, reason: "no_email" };
    }

    const cfg = this.getSmtpConfig();
    if (!cfg.enabled) {
      return { skipped: true, reason: "smtp_disabled" };
    }
    if (!cfg.host || !cfg.user || !cfg.pass) {
      return { skipped: true, reason: "smtp_not_configured" };
    }

    const { subject, text, html } = this.builder.build({ run, token, kind });

    try {
      const { transporter, from } = this.createTransport();
      const info = await transporter.sendMail({
        from: `Matik Control <${from}>`,
        to: email,
        subject,
        text,
        html,
      });
      return { ok: true, messageId: info.messageId, to: email };
    } catch (err) {
      console.error("[mail] send failed:", err.message);
      return { ok: false, error: err.message, to: email };
    }
  }
}

export const mailService = new MailService();
