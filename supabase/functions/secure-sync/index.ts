import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Authentification du joueur
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return new Response("Unauthorized", { status: 401 })

    const { game_slug, new_data } = await req.json()
    
    // 2. Récupérer l'ancienne sauvegarde pour comparer
    const { data: oldRow } = await supabaseAdmin
      .from('user_game_data')
      .select('data')
      .eq('user_id', user.id)
      .eq('game_slug', game_slug)
      .maybeSingle()

    const oldData = oldRow?.data || { bananes: 0, saved_at: 0 }

    // --- LOGIQUE ANTI-TRICHE (TIMESTAMP & COHÉRENCE) ---

    // A. Vérification du Timestamp (Session)
    // Empêche de renvoyer une vieille sauvegarde ou de "rejouer" une requête
    if (new_data.saved_at <= oldData.saved_at) {
      return new Response("Old timestamp detected", { status: 400 })
    }

    // B. Vérification de la cohérence (Exemple : Bananes)
    // On interdit de gagner plus de 500 bananes entre deux synchros (toutes les 30s)
    const diffBananes = new_data.bananes - oldData.bananes
    if (diffBananes > 500) {
      console.warn(`🚨 Triche suspectée pour ${user.id} : +${diffBananes} bananes`)
      return new Response("Abnormal gain detected", { status: 403 })
    }

    // 3. Si tout est OK, on enregistre avec le Service Role
    const { error: upsertError } = await supabaseAdmin
      .from('user_game_data')
      .upsert({
        user_id: user.id,
        game_slug: game_slug,
        data: new_data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,game_slug' })

    if (upsertError) throw upsertError

    return new Response(JSON.stringify({ status: "success" }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    return new Response(err.message, { status: 500, headers: corsHeaders })
  }
})
