// GET /api/results, POST /api/results
export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: 'D1 DB 바인딩이 없습니다.' }, { status: 500 });
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, round, name, result, created_at FROM ladder_player_results ORDER BY id DESC LIMIT 200'
    ).all();
    return Response.json(results);
  } catch (error) {
    console.error(error);
    return Response.json({ error: '기록 조회 중 오류가 발생했습니다. 테이블을 확인하세요.' }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: 'D1 DB 바인딩이 없습니다.' }, { status: 500 });
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON 형식이 올바르지 않습니다.' }, { status: 400 }); }
  const players = body?.players;
  if (!Array.isArray(players) || (players.length < 1 || players.length > 5) ||
      players.some(p => typeof p?.name !== 'string' || !p.name.trim() || p.name.length > 50 ||
                        typeof p?.result !== 'string' || !p.result.trim() || p.result.length > 50)) {
    return Response.json({ error: '1~5명의 이름과 결과가 필요합니다.' }, { status: 400 });
  }
  try {
    // 학습용 회차 번호: 동시 저장이 많은 운영 환경에서는 별도 games 테이블 권장
    const { results } = await env.DB.prepare(
      'SELECT COALESCE(MAX(round), 0) + 1 AS next_round FROM ladder_player_results'
    ).all();
    const round = results[0].next_round;
    const statements = players.map(p => env.DB.prepare(
      'INSERT INTO ladder_player_results (round, name, result) VALUES (?, ?, ?)'
    ).bind(round, p.name.trim(), p.result.trim()));
    await env.DB.batch(statements);
    return Response.json({ message: `${players.length}명 저장 완료`, round, count: players.length }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: '저장 중 오류가 발생했습니다. 테이블을 확인하세요.' }, { status: 500 });
  }
}
