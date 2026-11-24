import nodemailer from 'nodemailer';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE = 'Finbuks';
const emailPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Server-only settings. The recipient is fixed by configuration, never by the visitor.
function config() {
  const user = process.env.CONTACT_SMTP_USER?.trim() || '';
  return {
    host: process.env.CONTACT_SMTP_HOST?.trim() || '',
    user,
    pass: process.env.CONTACT_SMTP_PASSWORD?.replace(/\s/g, '') || '',
    to: process.env.CONTACT_TO_EMAIL?.trim() || user,
  };
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 12000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  // Honeypot: bots fill the hidden field. Pretend success so they learn nothing.
  if (text(body.website, 200)) return NextResponse.json({ ok: true });

  const name = text(body.name, 100);
  const email = text(body.email, 254);
  const topic = text(body.topic, 60) || 'General';
  const message = text(body.message, 5000);
  if (!name || /[\r\n\x00-\x1f]/.test(name)) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  if (!emailPattern.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  if (message.length < 2) return NextResponse.json({ error: 'Please enter a message.' }, { status: 400 });

  const c = config();
  if (!c.host || !c.user || !c.pass || !emailPattern.test(c.to)) {
    console.error('contact-mail-not-configured');
    return NextResponse.json({ error: 'Message delivery is temporarily unavailable. Please email us directly.' }, { status: 503 });
  }

  try {
    const transport = nodemailer.createTransport({
      host: c.host, port: 465, secure: true,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      from: { name: `${SITE} contact form`, address: c.user },
      to: c.to,
      replyTo: { name: name.replace(/[<>"]/g, ''), address: email },
      subject: `${SITE} enquiry: ${topic.replace(/[\r\n]+/g, ' ')}`,
      text: `Name: ${name}\nReply address: ${email}\nTopic: ${topic}\n\n${message}`,
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Delivery not accepted');
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    console.error('contact-mail-failed', typeof code === 'string' ? code : 'UNKNOWN');
    return NextResponse.json({ error: 'Your message could not be sent. Please try again or email us directly.' }, { status: 502 });
  }
}
