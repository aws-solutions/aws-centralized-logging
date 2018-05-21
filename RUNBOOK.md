# Accessing the Kibana settings APi

Kibana has a settings api that allows fine grained control. The endpoint itself
can be found in the console by going to elasticsearch service. Find your domain
in "My Domains" then click it and look at the overview tab. There you will see
"Endpoint". That's the url you need. 

The endpoint is behind a stringent access policy and it cannot be accessed 
through the proxies. If you need to hit this endpoint You need to change the
access policy to allow your ip through. Do this by clicking the "Modify Access Policy"
button at the top then add your ip address to the "aws:SourceIp" array on line 21.

The Kibana api exposes a bunch of useful configuration endpoints. These endpoints
can be found [here](https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/aes-supported-es-operations.html#es_version_6_0)

Unfortunatley, the aws docs just tells you what endpoints are available to hit
and not what each endpoint does. For that you need to check out the kibana docs.
Were using version 6.0 and the docs can be found [here](https://www.elastic.co/guide/en/elasticsearch/reference/6.0/index.html).

## Limiting to root key logging only

Limiting Kibana to root level key logging can be achieved by hitting the api.
the command is:

```shell
curl -X PUT \
  https://ourendpoint.us-east-1.es.amazonaws.com/_template/cwl \
  -H 'Content-Type: application/json' \
  -d '{
    "index_patterns": ["cwl-*"],
    "settings": {
    	"index.mapping.depth.limit": 1
    }
}'
```

This created a template called "cwl" which gets applied to evey new index that
matches the pattern "cwl-*". This does not go back and recursively apply the pattern.
it only applies to new indecies. This is just one of many things you can do.
You can also set up a pattern to only take in data that contains certain fields.

# Using curator-cli

If the UI is unavailable, you can use a tool called Curator to connect.
Instalation instructions [here](https://www.elastic.co/guide/en/elasticsearch/client/curator/current/installation.html)

With this tool you can modify, create, and delete indices. 
To delete all indices,
`curator_cli delete_indices --filter_list '{"filtertype": "none"}'`

This is also compatible with AWS however, it does not appear to be compatible with
profiles. Adding all of your profile information to default seems to work.

you also need to install `requests-aws4auth` using pip in order to use aws credentials.