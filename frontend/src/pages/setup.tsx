'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Icon } from '@/components/ui/icon'
import { BrandMark } from '@/components/brand-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export default function Setup() {
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { completeSetup } = useAuth()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (formData.username.trim().length < 3) {
      setError('Username minimal 3 karakter. Gunakan nama yang mudah dikenali operator.')
      return
    }
    if (formData.password.length < 8) {
      setError('Password minimal 8 karakter. Tambahkan kombinasi huruf, angka, dan simbol.')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Konfirmasi password berbeda. Ketik ulang password yang sama.')
      return
    }

    setLoading(true)
    try {
      if (!await completeSetup(formData.username.trim(), formData.password)) {
        setError('Akun administrator belum dapat dibuat. Periksa log server lalu coba lagi.')
      }
    } catch {
      setError('Panel tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const updateField = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((value) => ({ ...value, [event.target.name]: event.target.value }))
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(22rem,0.85fr)_minmax(32rem,1.15fr)]">
      <section
        className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14"
        aria-label="Setup information"
      >
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <div className="text-lg font-bold">SkyGenPanel</div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              First-run setup
            </div>
          </div>
        </div>
        <div className="max-w-lg">
          <div className="mb-5 h-1 w-14 rounded-full bg-primary" />
          <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-sidebar-foreground">
            Secure the operations console before connecting devices.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Akun pertama menjadi administrator panel. Simpan kredensial ini di password manager dan jangan gunakan ulang password GenieACS.
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">One administrator account is created in this step.</p>
      </section>

      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" title="SkyGenPanel" />
            <div>
              <div className="font-bold text-foreground">SkyGenPanel</div>
              <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                First-run setup
              </div>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <p className="page-kicker">Initial administrator</p>
              <CardTitle className="text-2xl font-bold">Create panel access</CardTitle>
              <CardDescription>
                Buat kredensial untuk orang yang bertanggung jawab atas konfigurasi ACS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                {error && (
                  <Alert id="setup-error" variant="destructive">
                    <Icon name="warning" size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <FieldGroup>
                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="username">Administrator username</FieldLabel>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      required
                      autoFocus
                      value={formData.username}
                      onChange={updateField}
                      placeholder="network-admin"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'setup-error' : 'username-hint'}
                    />
                    <FieldDescription id="username-hint">
                      Minimal 3 karakter; hindari username pribadi jika akun dipakai tim.
                    </FieldDescription>
                  </Field>

                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={formData.password}
                      onChange={updateField}
                      placeholder="Minimal 8 karakter"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'setup-error' : 'password-hint'}
                    />
                    <FieldDescription id="password-hint">
                      Gunakan password unik yang tidak digunakan pada ONT atau GenieACS.
                    </FieldDescription>
                  </Field>

                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={formData.confirmPassword}
                      onChange={updateField}
                      placeholder="Ketik ulang password"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'setup-error' : undefined}
                    />
                  </Field>
                </FieldGroup>

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading && <Spinner data-icon="inline-start" />}
                  {loading ? 'Creating administrator…' : 'Create administrator'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
