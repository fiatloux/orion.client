/*******************************************************************************
 * @license
 * Copyright (c) 2014 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*eslint-env browser, amd*/
define(['orion/plugin', 'orion/editor/stylers/text_x-csharp/syntax'], function(PluginProvider, mCsharp) {

	/**
	 * Plug-in headers
	 */
	var headers = {
		name: "Orion C# Tool Support",
		version: "1.0",
		description: "This plugin provides C# tools support for Orion."
	};
	var provider = new PluginProvider(headers);

	/**
	 * Register the C# content type
	 */
	provider.registerServiceProvider("orion.core.contenttype", {}, {
		contentTypes: [
			{	id: "text/x-csharp",
				"extends": "text/plain",
				name: "C#",
				extension: ["cs"]
			}
		] 
	});

	/**
	 * Register syntax styling
	 */
	provider.registerServiceProvider("orion.edit.highlighter", {}, mCsharp.grammars[mCsharp.grammars.length - 1]);

	provider.connect();
});