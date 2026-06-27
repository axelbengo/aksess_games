import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 1. Gestion du Preflight (OBLIGATOIRE pour CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 2. Vérification du Token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), { status: 401, headers: corsHeaders })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders })
    }

    // 3. Lecture du corps de la requête
    const { game_slug, new_data } = await req.json()
    if (!game_slug || !new_data) {
      return new Response(JSON.stringify({ error: "Missing payload" }), { status: 400, headers: corsHeaders })
    }

    // 4. Récupération de l'ancienne sauvegarde
    const { data: oldRow } = await supabaseAdmin
      .from('user_game_data')
      .select('data')
      .eq('user_id', user.id)
      .eq('game_slug', game_slug)
      .maybeSingle()

    const oldData = oldRow?.data || { bananes: 0, saved_at: 0 }

    // --- LOGIQUE DE SÉCURITÉ ---

    // A. Anti-Rejeu (Timestamp)
    const newTs = Number(new_data.saved_at) || 0
    const oldTs = Number(oldData.saved_at) || 0
    if (newTs <= oldTs && oldTs !== 0) {
      console.log(`[Abort] Old timestamp: New(${newTs}) <= Old(${oldTs})`)
      return new Response(JSON.stringify({ status: "ignored", reason: "old_timestamp" }), { headers: corsHeaders })
    }

    // B. Anti-Gros Gains (Cohérence)
    const newBananes = Number(new_data.bananes) || 0
    const oldBananes = Number(oldData.bananes) || 0
    if (newBananes - oldBananes > 1000) {
      return new Response(JSON.stringify({ error: "Abnormal gain" }), { status: 403, headers: corsHeaders })
    }

    // 5. Enregistrement
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
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    console.error("Crash Secure Sync:", err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})
