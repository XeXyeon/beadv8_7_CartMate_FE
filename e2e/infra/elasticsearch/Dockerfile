# BE k8s/infra/elasticsearch.yaml 의 initContainer(install-nori)를 이미지에 미리 구워 둔다
FROM elasticsearch:9.5.5@sha256:b7b0f24e9b5e90656ffe69804b3a48907499ab2b9cd67f02b7af3aff1b026a89
RUN CLI_JAVA_OPTS="-Xmx128m" bin/elasticsearch-plugin install --batch analysis-nori
