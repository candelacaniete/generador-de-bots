-- Si ya corriste el schema antes, ejecutá esto en el SQL Editor:

grant execute on function match_document_chunks(vector, uuid, int) to service_role;
grant execute on function match_document_chunks(vector, uuid, int) to anon;
grant execute on function match_document_chunks(vector, uuid, int) to authenticated;
