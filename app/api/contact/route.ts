import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Contact form handler. Sends the message by SMTP to CONTACT_EMAIL.
// Needs these Vercel environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// and optionally SMTP_FROM and CONTACT_EMAIL.
export const runtime = 'nodejs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.botcheck) return NextResponse.json({ success: true });
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 200);
    const topic = String(body.topic || '').trim().slice(0, 80);
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!name || !message || !EMAIL.test(email)) {
      return NextResponse.json({ error: 'Name, valid email and message are required' }, { status: 400 });
    }

    const host = (process.env.SMTP_HOST || '').trim();
    const port = parseInt((process.env.SMTP_PORT || '').trim(), 10);
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();
    if (!host || !port || !user || !pass) {
      return NextResponse.json({ error: 'Mail is not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 15000
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: process.env.CONTACT_EMAIL || 'mbanwie@gmail.com',
      replyTo: email,
      subject: `Finbuks contact from ${name}`,
      html: `<p><strong>Name:</strong> ${esc(name)}</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Topic:</strong> ${esc(topic)}</p><p><strong>Message:</strong></p><p>${esc(message).replace(/\n/g, '<br>')}</p>`
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
