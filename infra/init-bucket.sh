#!/bin/sh
# Creates the document bucket on the local S3 mock (idempotent).
bucket="${S3_BUCKET:-fico-documents}"
i=0
while [ "$i" -lt 30 ]; do
  if curl -sf -X PUT "http://s3:9090/${bucket}" >/dev/null; then
    echo "bucket ${bucket} ready"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done
echo "could not create bucket ${bucket}" >&2
exit 1
