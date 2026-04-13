import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vajpzkwmaqswqvmmbvem.supabase.co'
const SUPABASE_KEY = 'sb_publishable_EeCQyh5hO07Kl_LIVq9uVQ_UZMhqoSm'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
