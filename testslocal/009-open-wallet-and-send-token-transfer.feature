Feature: Open Wallet and Send Token Transfer Txn
    As a visitor to the site,
    I should be able to open an existing wallet
    And send a token transfer transaction from it

Background:
    Given I am on the wallet site

@watch
Scenario: Visitor opens a wallet and sends a token transfer transaction
    When I click Open Wallet
    And enter my mnemonic phrase "absorb filled syrup axle occupy club fairly break liquid major patrol forbid throat swing emit hey inward blood pillow esteem madame cope under tent hawse glory muscle order bruise bold dad get carpet talk"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q01050058bb3f8cb66fd90d0347478e5bdf3a475e82cfc5fe5dc276500ca21531e6edaf3d2d0f7e" on the page
    When I then fill in the to address as "Q010200a3f33bbfff9432bee62828345ba4cb6e24182a43ea38f472ad3cf775941b25c0870d6f41"
    And set the transfer type to my recently created token
    And enter the amount as "50"
    And enter the fee as "0.005"
    And change the OTS Key Index to "12"
    And click confirm
    And I should then see a form confirming my token transfer transaction
    When I then click confirmation transaction for token transfer
    Then I should see a token relaying message "Your transaction is being relayed into the QRL network..."
    And I should see shortly after sending my token transfer "Success! Your token transfer has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should see the token transfer pending "Transaction Status: Pending"
    And shortly after I should see the token transfer complete "Transaction Status: Complete - Transaction"
