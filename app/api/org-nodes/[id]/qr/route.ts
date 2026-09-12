import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { Capability } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const orgNodeId = Number(id);
  if (!Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) return NextResponse.json({ error: "Вузол не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ACTIVATE_EMPLOYEE, { orgNodePath: orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права генерувати QR для цього вузла" }, { status: 403 });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return NextResponse.json({ error: "TELEGRAM_BOT_USERNAME не заданий у .env" }, { status: 500 });

  const link = `https://t.me/${botUsername}?start=${orgNode.id}`;
  const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 320 });

  return NextResponse.json({ link, qrDataUrl });
}
