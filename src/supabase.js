import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const TABLE = 'submissions'

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
)

// Database rows use snake_case; the app uses camelCase.
function fromRow(row) {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    tallies: Array.isArray(row.tallies) ? row.tallies : [],
  }
}

/**
 * Uploads a tally submission to Supabase.
 */
export async function submitTallyToCloud(submission) {
  if (!supabase) throw NOT_CONFIGURED
  const { error } = await supabase.from(TABLE).upsert({
    id: submission.id,
    submitted_by: submission.submittedBy,
    submitted_at: submission.submittedAt,
    tallies: submission.tallies,
  })
  if (error) throw error
}

async function fetchAll() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

/**
 * Loads all submissions, then re-loads whenever any device inserts, updates
 * or deletes one. Returns an unsubscribe function.
 */
export function subscribeToSubmissions(onUpdate, onError) {
  if (!supabase) {
    onError?.(NOT_CONFIGURED)
    return () => {}
  }

  let active = true
  const refresh = () =>
    fetchAll()
      .then((items) => active && onUpdate(items))
      .catch((err) => {
        console.warn('Supabase fetch error (falling back to local):', err)
        if (active) onError?.(err)
      })

  refresh()

  const channel = supabase
    .channel(`${TABLE}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, refresh)
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Supabase realtime error:', err ?? status)
        if (active) onError?.(err ?? new Error(status))
      }
    })

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

/**
 * Removes a single submission from Supabase.
 */
export async function deleteSubmissionFromCloud(id) {
  if (!supabase) throw NOT_CONFIGURED
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

/**
 * Deletes all submissions from Supabase.
 */
export async function clearAllSubmissionsFromCloud() {
  if (!supabase) throw NOT_CONFIGURED
  // Supabase requires a filter on delete; this matches every row.
  const { error } = await supabase.from(TABLE).delete().neq('id', '')
  if (error) throw error
}
