Battleship AI
=============

This is an advanced Battleship AI designed to connect to a Battleship server (https://github.com/jmulieri/battleship).

The project includes both a random AI with basic targeting and an advanced AI with prediction based targeting and defenses for other algorithms.

##Server Configuration

To run this client, you must first set up and configure the server. Since this is an HTML/JS client intended to be run from the browser, you must do one of the following:

1. Update the server to support CORS requests
2. Disable CORS protection in your browser
3. Host this application from the server public folder

For the purposes of this guide, we are assuming #1. To update the server for CORS support:

1. Run `gem install rack-cors`
2. Add to your Gemfile: `gem 'rack-cors', :require => 'rack/cors'`
3. At the bottom of your config/application.rb file add:
```
    config.middleware.insert_before ActionDispatch::Static, Rack::Cors do
      allow do
        origins '*'
        resource '*', :headers => :any, :methods => [:get, :post, :options]
      end
    end
```

4. Optionally, you may need to add a crossdomain.xml file to your public folder:
```
<?xml version="1.0"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.adobe.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
    <!-- Read this: www.adobe.com/devnet/articles/crossdomain_policy_file_spec.html -->

    <!-- Most restrictive policy: -->
    <!--<site-control permitted-cross-domain-policies="none"/>-->

    <!-- Least restrictive policy: -->
    <site-control permitted-cross-domain-policies="all"/>
    <allow-access-from domain="*" to-ports="*" secure="false"/>
    <allow-http-request-headers-from domain="*" headers="*" secure="false"/>
</cross-domain-policy>
```

##Client Configuration

Apart from option #3 in the server configuration, this application does not require any special setup. You can host the client folder or open index.html in a browser without hosting depending on your browser's security settings.

##Usage

1. Open/browse to index.html in a modern browser such as Chrome, Safari, FireFox, or even recent versions of IE.
2. Enter the Server URL and User name
3. Select Advanced for the Algorithm
4. Click Connect

If successful you should see a game board appear and the status on the right side should change to "Playing."

Connect another client or open index.html in another window and connect. Make sure you do not use the same user name.

Once both parties are connected the game play will begin automatically. You can change the delay between turns by changing the **speed** selection at any time.
