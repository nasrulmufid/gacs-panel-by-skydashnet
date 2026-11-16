import { BrandMark } from '@/components/brand-mark'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import release from '@/generated/release.json'

const CATEGORY_STYLE: Record<string, { icon: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  Breaking: { icon: 'warning', variant: 'destructive' },
  New: { icon: 'check', variant: 'default' },
  Improved: { icon: 'chart', variant: 'secondary' },
  Fixed: { icon: 'check', variant: 'outline' },
  Changed: { icon: 'refresh', variant: 'secondary' },
  Security: { icon: 'lock', variant: 'destructive' },
  Maintenance: { icon: 'settings', variant: 'outline' },
}

export const APP_RELEASE = release

export function ReleaseNotesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const releaseDate = new Date(`${release.releasedAt}T00:00:00`)
  const formattedDate = releaseDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border bg-primary/10 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3.5 pr-6">
            <BrandMark className="size-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  v{release.version}
                </Badge>
                <span className="text-xs text-muted-foreground">{formattedDate}</span>
              </div>
              <DialogTitle className="mt-1.5 text-lg font-bold">
                What’s new in SkyGenPanel
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Generated from the Git commits included since {release.basedOnTag}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <ol className="flex flex-col gap-2.5">
            {release.changes.map((change) => {
              const style = CATEGORY_STYLE[change.category] || CATEGORY_STYLE.Maintenance
              return (
                <li
                  key={`${change.shortHash}-${change.title}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3.5"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-primary shadow-xs">
                    <Icon name={style.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={style.variant}>{change.category}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{change.shortHash}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-5 text-foreground">{change.title}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <DialogFooter className="flex-col items-start justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Build <strong className="font-mono text-foreground">#{release.build}</strong>
            </span>
            <span>
              Source <strong className="font-mono text-foreground">{release.sourceCommit}</strong>
            </span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={release.compareUrl} target="_blank" rel="noreferrer">
              View Git history
              <Icon name="external" size={14} />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
