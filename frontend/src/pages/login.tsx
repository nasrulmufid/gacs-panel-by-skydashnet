'use client'

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { Icon } from '@/components/ui/icon'
import { BrandMark } from '@/components/brand-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

export default function Login() {
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const ok = await login(formData.username, formData.password)
      if (ok) navigate('/dashboard')
      else setError('Username atau password tidak cocok. Periksa kembali kredensial administrator.')
    } catch {
      setError('Panel tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(22rem,0.85fr)_minmax(32rem,1.15fr)]">
      <section
        className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14"
        aria-label="Product information"
      >
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <div className="text-lg font-bold">SkyGenPanel</div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              GenieACS operations
            </div>
          </div>
        </div>
        <div className="max-w-lg">
          <div className="mb-5 h-1 w-14 rounded-full bg-primary" />
          <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-sidebar-foreground">
            Monitor ONT health. Recover subscriber service.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Satu konsol untuk meninjau inform terakhir, redaman optik, konfigurasi WAN, dan topologi jaringan yang dilaporkan GenieACS.
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Administrative access only · SkydashNET
        </p>
      </section>

      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" title="SkyGenPanel" />
            <div>
              <div className="font-bold text-foreground">SkyGenPanel</div>
              <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                GenieACS operations
              </div>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <p className="page-kicker">Operator access</p>
              <CardTitle className="text-2xl font-bold">Sign in to the panel</CardTitle>
              <CardDescription>
                Gunakan akun administrator SkyGenPanel untuk membuka data perangkat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                {error && (
                  <Alert id="login-error" variant="destructive">
                    <Icon name="warning" size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <FieldGroup>
                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      autoFocus
                      value={formData.username}
                      onChange={(event) => setFormData((value) => ({ ...value, username: event.target.value }))}
                      placeholder="admin"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'login-error' : undefined}
                    />
                  </Field>

                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={formData.password}
                        onChange={(event) => setFormData((value) => ({ ...value, password: event.target.value }))}
                        placeholder="Masukkan password"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'login-error' : undefined}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading && <Spinner data-icon="inline-start" />}
                  {loading ? 'Verifying account…' : 'Sign in'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            Jika akses ditolak, hubungi administrator panel untuk mereset kredensial.
          </p>
        </div>
      </main>
    </div>
  )
}
