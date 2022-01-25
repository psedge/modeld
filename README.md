![modeld](./static/modeld.png "modeld")

"make every model collaborative, declarative, and programmable"

Models represent a single view of a system or application, taken at a point in time. They might miss out on details
needed later, but were the correct level of abstraction for the author to communicate the ideas they wanted to at the time.
They might not even represent the full truth now, or at some point in the future. The beauty of representing a model in 
both a visual and written way is:

1. It's fast to draw something or write code, not both. Translation between the two normally takes time, and 
provides the most value. It's simple to write code and show someone detailed documentation, but it takes time for them to
get a whole-system understanding of how components fit together. Similarly, it's easy to sketch something, but it requires 
follow-up work to convert it to system requirements or interface definitions. 

2. It's difficult to update diagrams, as they typically don't benefit from much of the version control maturity that
software does. Finding the reason for a change, or the author of an edit, is either impossible or requires meat-world
activities. With a model simultaneously drawn and written, it's possible to have the level of insight we expect from
documents and code.

3. It allows a set of people with different experience and backgrounds to collaborate on a design, both contributing
the parts that bought them to the room. "Bridging the gap between business and engineering" sounds like a generic 
platitude of most productivity tooling, but the consequences are real, expensive, and avoidable.


### Functionality

#### Meta

[ ] Figure out a better way to manipulate code - awareness of structure, tokens, and subtrees

[ ] Define a protodefinition for types, with some level of IDE integration for suggestions

[ ] Redesign event handling either side: atomic edits, reproducible outcomes
    - Move from `browser -> browser` comms to `browser -> server -> browser` with sockets/rtc
    - Figure out how to queue, merge, and track edits across clients

[ ] Modify drawio shell
    - Remove "unsaved progress"
    - Hide the tab view, moving this to dual-control code and diagram
    - Figure out layer integration with code

#### Cells 

[x] Add cell to graph -> create node

[x] Delete cell in graph -> delete code node

[x] Delete node in code -> delete cell (Graph.prototype.removeCells)

#### Connections

[x] Add connection to code -> create edge

[x] Add edge to graph -> create code

[ ] Delete connection in code -> delete edge
