// PUT /api/results/:id, DELETE /api/results/:id
function getId(params) {
  const value = String(params.id ?? '');
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return Response.json({ error: 'D1 DB 바인딩이 없습니다.' }, { status: 500 });
  const id = getId(params);
  if (id === null) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON 형식이 올바르지 않습니다.' }, { status: 400 }); }
  const result = body?.result;
  if (typeof result !== 'string' || !result.trim() || result.length > 50) {
    return Response.json({ error: '결과를 1~50자로 입력해 주세요.' }, { status: 400 });
  }
  try {
    const updated = await env.DB.prepare(
      'UPDATE ladder_player_results SET result = ? WHERE id = ?'
    ).bind(result.trim(), id).run();
    if (!updated.meta.changes) return Response.json({ error: '해당 기록이 없습니다.' }, { status: 404 });
    return Response.json({ message: '수정 완료', id });
  } catch (error) {
    console.error(error);
    return Response.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function onRequestDelete({ env, params }) {
  if (!env.DB) return Response.json({ error: 'D1 DB 바인딩이 없습니다.' }, { status: 500 });
  const id = getId(params);
  if (id === null) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });
  try {
    const deleted = await env.DB.prepare(
      'DELETE FROM ladder_player_results WHERE id = ?'
    ).bind(id).run();
    if (!deleted.meta.changes) return Response.json({ error: '해당 기록이 없습니다.' }, { status: 404 });
    return Response.json({ message: '삭제 완료', id });
  } catch (error) {
    console.error(error);
    return Response.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
