mysqldump -u billing_user -p \
  --no-create-info \
  --skip-triggers \
  --complete-insert \
  billing_portal copper_book_requests \
  > /tmp/copper_book_requests.sql

  scp /tmp/copper_book_sync.csv ubuntu@13.63.129.179:/tmp/copper_book_sync.csv