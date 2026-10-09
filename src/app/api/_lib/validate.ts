import { NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function serverError(message = 'Internal server error') {
  return NextResponse.json({ error: message }, { status: 500 })
}

export function ok<T>(data: T) {
  return NextResponse.json(data)
}
