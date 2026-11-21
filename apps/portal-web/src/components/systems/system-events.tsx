import type { SystemEvent } from '@lab/contracts'
import Link from 'next/link'
import { eventLabel } from '@/lib/projects'

interface SystemEventsProps {
  readonly events: SystemEvent[]
  readonly peerLabel: string
  readonly empty: string
}

/** Event contracts of one side of a system, linking to the system on the other side. */
export function SystemEvents({ events, peerLabel, empty }: SystemEventsProps) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {events.map((event) => (
        <li key={`${event.topic}/${event.event}`} className="space-y-1 py-3">
          <p className="font-mono text-xs break-all">{eventLabel(event)}</p>
          {event.payload ? (
            <p className="text-xs text-muted-foreground">Carrega: {event.payload}</p>
          ) : null}
          <p className="text-sm">
            <span className="text-muted-foreground">{peerLabel}: </span>
            {event.peers.length
              ? event.peers.map((peer, index) => (
                  <span key={peer.name}>
                    {index > 0 ? ', ' : ''}
                    {peer.slug ? (
                      <Link
                        href={`/sistemas/${peer.slug}`}
                        className="font-medium hover:text-primary"
                      >
                        {peer.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{peer.name}</span>
                    )}
                  </span>
                ))
              : 'ninguém cadastrado'}
          </p>
        </li>
      ))}
    </ul>
  )
}
